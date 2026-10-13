/** OTP code lifetime and UI countdown (seconds). */
export const LOGIN_OTP_TTL_SECONDS = 5 * 60;

/** Minimum wait before another OTP may be issued (seconds). */
export const LOGIN_OTP_RESEND_COOLDOWN_SECONDS = 30;

/** Max "Send again" requests after the initial OTP in a window. */
export const LOGIN_OTP_MAX_RESENDS = 5;

/** Rolling window used to count OTP issues for the resend cap. */
export const LOGIN_OTP_RESEND_WINDOW_SECONDS = 15 * 60;

/** How long the post-verify proof cookie remains valid. */
export const LOGIN_OTP_PROOF_TTL_SECONDS = 600;

export const LOGIN_OTP_RESEND_LIMIT_MESSAGE =
  "Too many requests. Please try again after 1 minute.";

export const LOGIN_OTP_RESEND_COOLDOWN_MESSAGE =
  "Please wait for the timer before requesting a new code.";

export function formatLoginOtpCooldownMessage(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  return `Please wait for the timer (${s}s) before requesting a new code.`;
}

export function parseLoginOtpCooldownSeconds(message: string | undefined): number | null {
  if (!message) return null;
  const match = message.match(/wait for the timer\s*(?:\((\d+)\s*s?\)|(\d+)\s*s)/i);
  if (match) {
    const val = Number(match[1] || match[2]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return null;
}
