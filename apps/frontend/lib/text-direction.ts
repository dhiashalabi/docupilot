const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"])

export function resolveTextDirection(
  language: string | null | undefined
): "rtl" | "ltr" | "auto" {
  if (!language) return "auto"
  const code = language.toLowerCase().slice(0, 2)
  if (RTL_LANGUAGES.has(code)) return "rtl"
  return "ltr"
}
