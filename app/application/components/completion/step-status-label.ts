export function stepStatusLabel(status: string | null | undefined): string {
  const words = String(status ?? "").trim().toLowerCase().split(/[_\s-]+/).filter(Boolean);
  if (!words.length) return "Pending";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
