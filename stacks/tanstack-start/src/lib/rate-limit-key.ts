/**
 * The rate-limit key for a client address: the IPv4 address, or the IPv6 /64 (one customer owns a
 * whole /64, so a per-address key would never repeat). Unknown addresses share one key.
 */
export function rateLimitKey(address: string | null | undefined): string {
  const ip = address?.trim()
  if (!ip) return 'unknown'
  if (!ip.includes(':')) return ip
  const [head = '', tail] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
  return `${groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}
