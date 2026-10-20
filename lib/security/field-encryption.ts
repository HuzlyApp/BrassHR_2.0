import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Base64-encoded 32-byte key, e.g. `openssl rand -base64 32`. */
export const PAYROLL_DATA_ENCRYPTION_KEY_ENV = "PAYROLL_DATA_ENCRYPTION_KEY";

const VERSION = "v1";
const IV_BYTES = 12;

export class FieldEncryptionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldEncryptionUnavailableError";
  }
}

function loadKey(envName: string): Buffer {
  const raw = process.env[envName]?.trim();
  if (!raw) throw new FieldEncryptionUnavailableError(`${envName} is not configured`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new FieldEncryptionUnavailableError(`${envName} must be a base64-encoded 32-byte key`);
  }
  return key;
}

export function isFieldEncryptionConfigured(envName: string = PAYROLL_DATA_ENCRYPTION_KEY_ENV): boolean {
  try {
    loadKey(envName);
    return true;
  } catch {
    return false;
  }
}

/** AES-256-GCM; output is `v1:<iv>:<tag>:<ciphertext>` (base64 parts). */
export function encryptField(plaintext: string, envName: string = PAYROLL_DATA_ENCRYPTION_KEY_ENV): string {
  const key = loadKey(envName);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptField(payload: string, envName: string = PAYROLL_DATA_ENCRYPTION_KEY_ENV): string {
  const [version, iv, tag, ciphertext] = payload.split(":");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unsupported encrypted field format");
  }
  const decipher = createDecipheriv("aes-256-gcm", loadKey(envName), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}
