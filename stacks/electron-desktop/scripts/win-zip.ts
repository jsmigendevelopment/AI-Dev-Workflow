/** What the Windows zip must hold to run: the executable and the app's code. */
const REQUIRED = (name: string) => [`${name}.exe`, 'resources/app.asar']

/** Lists what is missing from the zip's entries, or [] when it holds everything. */
export function missingFromZip(entries: readonly string[], name: string): string[] {
  return REQUIRED(name).filter(
    (file) => !entries.some((entry) => entry === file || entry.endsWith(`/${file}`)),
  )
}
