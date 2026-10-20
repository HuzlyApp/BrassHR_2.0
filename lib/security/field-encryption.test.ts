import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  decryptField,
  encryptField,
  FieldEncryptionUnavailableError,
  isFieldEncryptionConfigured,
} from "@/lib/security/field-encryption";

const ENV = "TEST_FIELD_ENCRYPTION_KEY";

afterEach(() => {
  delete process.env[ENV];
});

describe("field-encryption", () => {
  it("round-trips with a fresh IV per call", () => {
    process.env[ENV] = randomBytes(32).toString("base64");
    const a = encryptField("000123456789", ENV);
    const b = encryptField("000123456789", ENV);
    expect(a).not.toBe(b);
    expect(a).not.toContain("000123456789");
    expect(decryptField(a, ENV)).toBe("000123456789");
  });

  it("rejects tampered ciphertext", () => {
    process.env[ENV] = randomBytes(32).toString("base64");
    const [v, iv, tag] = encryptField("secret", ENV).split(":");
    const forged = [v, iv, tag, Buffer.from("other!").toString("base64")].join(":");
    expect(() => decryptField(forged, ENV)).toThrow();
  });

  it("fails closed without a valid key", () => {
    expect(isFieldEncryptionConfigured(ENV)).toBe(false);
    expect(() => encryptField("x", ENV)).toThrow(FieldEncryptionUnavailableError);
    process.env[ENV] = Buffer.from("short").toString("base64");
    expect(() => encryptField("x", ENV)).toThrow(FieldEncryptionUnavailableError);
  });
});
