// Test helper (#747): the spellings of one refused flag a gate test should try, so a refusal covers the whole input
// and not only the spelling the issue named (default deny). `spellings("--dry")` gives the flag as written, its upper,
// lower, title and alternating-case forms, `_` and no-separator joins of a multi-word name, a plural, a trailing `=1` or
// `=`, and the leading `--`, `-`, `__`, `_` and no-prefix forms, with no duplicates. Not a test file: tests import it.

const PREFIXES = ["--", "-", "__", "_", ""];
const SEPARATORS = ["-", "_", ""];
const SUFFIXES = ["", "=1", "="];

const title = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
const alternating = (word) => [...word.toLowerCase()].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join("");
// The words of a flag name: split on `-`, `_` and a lower-to-upper step ("dryRun"), so any joined form reads the same.
const wordsOf = (flag) => flag.replace(/^[-_]+/, "").replace(/([a-z\d])([A-Z])/g, "$1 $2").split(/[-_\s]+/).filter(Boolean);
const plurals = (word) => [word, `${word}s`, `${word}es`, ...(/[^aeiou]y$/i.test(word) ? [`${word.slice(0, -1)}ies`] : [])];

/** Every spelling of `flag` worth refusing: `spellings("--dry")` includes "--DRY", "--Dry", "--dRy", "--dry=1", "--drys", "-dry", "_dry" and "dry". */
export function spellings(flag) {
  const words = wordsOf(String(flag));
  if (!words.length) throw new Error(`spellings: no word in "${flag}"`);
  const out = new Set([String(flag)]);
  const casings = [(w) => w.toLowerCase(), (w) => w.toUpperCase(), title, alternating];
  for (const prefix of PREFIXES) {
    for (const separator of SEPARATORS) {
      for (const casing of casings) {
        const cased = words.map(casing);
        const camel = [cased[0].toLowerCase(), ...cased.slice(1).map(title)];
        for (const form of [cased, camel]) {
          for (const last of plurals(form.at(-1))) {
            for (const suffix of SUFFIXES) out.add(`${prefix}${[...form.slice(0, -1), last].join(separator)}${suffix}`);
          }
        }
      }
    }
  }
  return [...out];
}
