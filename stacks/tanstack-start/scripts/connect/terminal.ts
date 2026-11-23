// Reads answers from the person's terminal in raw mode, so a key is typed with no echo at all.
// Paste works: a pasted value arrives as one chunk, and with bracketed paste (most terminals)
// line breaks inside a paste stay part of the value instead of ending it. Anything typed or
// pasted before a question appears is thrown away, so a leftover line of a key can never be
// taken as, or echoed by, the next answer.
import { spawnSync } from 'node:child_process'

export interface TtyInput {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => unknown
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown
  on(event: 'end', listener: () => void): unknown
  resume(): unknown
  pause(): unknown
}

export interface Output {
  write(text: string): unknown
  isTTY?: boolean
}

/** Ctrl-C while a prompt is open. */
export class Stopped extends Error {}

/**
 * How an answer shows while typed: `hidden` shows nothing (every value), `answer`
 * (y/N questions) shows only the start of "yes" or "no", so a key pasted there stays hidden.
 */
export type Echo = 'hidden' | 'answer'

const ESC = '\x1b'
const PASTE_START = `${ESC}[200~`
const PASTE_END = `${ESC}[201~`
// ESC [ params final-byte, and an unfinished one that may still be arriving.
const SEQUENCE = new RegExp(`^${ESC}\\[[0-9;?]*[@-~]`)
const PARTIAL = new RegExp(`^${ESC}(\\[[0-9;?]*)?$`)
// Escape sequences (OSC, CSI, others) and every other control character.
const OSC = new RegExp(`${ESC}\\][^\\x07${ESC}]*(?:\\x07|${ESC}\\\\)?`, 'g')
const CSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]?`, 'g')
const char = (code: number) => String.fromCharCode(code)
const CONTROL = new RegExp(`[${char(0)}-${char(9)}${char(11)}-${char(31)}${char(127)}-${char(159)}]`, 'g')

/** Text with no escape sequences or control characters (line breaks kept), safe to print. */
export const safeText = (text: string) => text.replace(OSC, '').replace(CSI, '').replace(CONTROL, '')

const PEM_START = /^\s*-----BEGIN [A-Z0-9 ]+-----/
const PEM_END = /-----END [A-Z0-9 ]+-----\s*$/

interface Line {
  value: string
  pasting: boolean
  last: string
  pem: boolean
}

/** Typing and deleting: the value changes. */
function edit(line: Line, key: string) {
  if (key === '\x7f' || key === '\b') line.value = line.value.slice(0, -1)
  else if (key === '\x15') line.value = ''
  else if (key >= ' ' || key === '\t') line.value += key
}

/** What one key does to the answer being typed. */
function applyKey(line: Line, key: string): 'done' | 'eof' | 'stop' | 'more' {
  const last = line.last
  line.last = key
  if (key === PASTE_START || key === PASTE_END) line.pasting = key === PASTE_START
  else if (key === '\x03') return 'stop'
  else if (key === '\x04') return line.value === '' ? 'eof' : 'more'
  else if (key === '\r' || key === '\n') {
    // A PEM block runs to its END line, even when pasted without bracketed paste.
    const openPem = line.pem && PEM_START.test(line.value) && !PEM_END.test(line.value)
    if (!line.pasting && !openPem) return 'done'
    // A line break inside a paste or a PEM block is part of the value; CR LF counts once.
    if (!(key === '\n' && last === '\r')) line.value += '\n'
  } else edit(line, key)
  return 'more'
}

/** What the screen shows for the answer so far. */
function shown(value: string, echo: Echo) {
  if (echo === 'hidden') return ''
  return /^(y|ye|yes|n|no)?$/i.test(value) ? value : ''
}

/** Keys from the input, one at a time; an escape sequence (the paste markers) is one key. */
function keys(input: TtyInput) {
  let buffer = ''
  let ended = false
  let wake: (() => void) | null = null
  let listening = false
  const waitForData = () =>
    new Promise<void>((resolve) => (wake = resolve)).then(() => {
      wake = null
    })
  return {
    // Listen only once a question is asked, so a dry run never reads the terminal.
    listen() {
      if (listening) return
      listening = true
      input.on('data', (chunk) => {
        buffer += String(chunk)
        wake?.()
      })
      input.on('end', () => {
        ended = true
        wake?.()
      })
    },
    /** Throws away whatever arrived before the question. */
    drain: () => (buffer = ''),
    /** The next key, or null at end of input. */
    async next(): Promise<string | null> {
      while (buffer === '') {
        if (ended) return null
        await waitForData()
      }
      while (buffer[0] === ESC && !SEQUENCE.test(buffer) && PARTIAL.test(buffer) && !ended)
        await waitForData()
      const key = buffer[0] === ESC ? (SEQUENCE.exec(buffer)?.[0] ?? ESC) : buffer[0]!
      buffer = buffer.slice(key.length)
      return key
    },
  }
}

export function terminal(input: TtyInput, output: Output) {
  const source = keys(input)

  /** Reads one answer. Null at end of input. `pem` keeps reading lines until the END line. */
  async function read(question: string, echo: Echo, pem = false): Promise<string | null> {
    source.listen()
    output.write(safeText(question))
    input.setRawMode?.(true)
    if (output.isTTY) output.write(`${ESC}[?2004h`)
    input.resume()
    // Let input already on its way arrive, then drop it: only keys typed after the question count.
    await new Promise((resolve) => setImmediate(resolve))
    source.drain()
    const line: Line = { value: '', pasting: false, last: '', pem }
    let screen = ''
    try {
      for (;;) {
        const key = await source.next()
        if (key === null) return line.value === '' ? null : line.value
        const step = applyKey(line, key)
        if (step === 'stop') throw new Stopped()
        if (step === 'eof') return null
        if (step === 'done') return line.value
        const next = shown(line.value, echo)
        if (next.startsWith(screen)) output.write(safeText(next.slice(screen.length)))
        else output.write('\b \b'.repeat(screen.length) + safeText(next))
        screen = next
      }
    } finally {
      if (output.isTTY) output.write(`${ESC}[?2004l`)
      input.setRawMode?.(false)
      input.pause()
      output.write('\n')
    }
  }

  return {
    read,
    /** y/N: only "y" or "yes" is a yes. A long answer is a key pasted in the wrong place. */
    async confirm(question: string): Promise<boolean> {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const answer = (await read(`${question} [y/N] `, 'answer'))?.trim() ?? ''
        if (answer.length <= 3) return /^y(es)?$/i.test(answer)
        output.write('  That looked like a key; nothing was saved. Answer y or n.\n')
      }
      return false
    },
  }
}

/** Opens a URL in the default browser. Returns false when nothing could open it. */
export function openUrl(
  url: string,
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): boolean {
  // No shell anywhere, so the URL is never parsed as a command (Windows' `start` would be).
  const [cmd, args]: [string, string[]] =
    platform === 'darwin'
      ? ['open', [url]]
      : platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : env.WSL_DISTRO_NAME
          ? ['wslview', [url]]
          : ['xdg-open', [url]]
  const r = spawnSync(cmd, args, { stdio: 'ignore', env: env as NodeJS.ProcessEnv, timeout: 10_000 })
  return !r.error && r.status === 0
}
