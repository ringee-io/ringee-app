/**
 * The prompt tells the agent which language to speak, and it reads better —
 * and is followed more reliably — as a name than as a locale code.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
};

export function languageName(language: string | null | undefined): string {
  return LANGUAGE_NAMES[(language ?? "").toLowerCase()] ?? "English";
}
