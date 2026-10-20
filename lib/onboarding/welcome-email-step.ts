const WELCOME_EMAIL_LIBRARY_ID = "welcome-email";

export function isWelcomeEmailWorkflowStep(stepType: string | null | undefined): boolean {
  return (
    String(stepType ?? "")
      .trim()
      .toLowerCase()
      .replaceAll("_", "-") === WELCOME_EMAIL_LIBRARY_ID
  );
}
export {};
