export function displayChatTitle(
  title: string | null | undefined,
  fallback: string
): string {
  const trimmed = title?.trim()
  return trimmed ? trimmed : fallback
}
