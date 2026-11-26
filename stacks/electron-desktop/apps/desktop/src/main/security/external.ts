/** Opens a link in the person's browser only if it is https; anything else (http, file, javascript) opens nothing. */
export async function openExternalSafely(
  url: string,
  open: (url: string) => Promise<void>,
): Promise<boolean> {
  if (!URL.canParse(url) || new URL(url).protocol !== 'https:') return false
  await open(url)
  return true
}
