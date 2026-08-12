export const MANAGED_REGION_START = '<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->'
export const MANAGED_REGION_END = '<!-- agent-policy:end -->'

const markerPattern = /<!--\s*agent-policy:(?:start\b[^>]*|end\b[^>]*)-->/g

function invalid(reason: string): never {
  throw new Error(`Invalid agent-policy Managed Region: ${reason}`)
}

function validateMarkers(source: string): readonly [number, number] | undefined {
  const markers = [...source.matchAll(markerPattern)]
  if (markers.length === 0) return undefined

  for (const marker of markers) {
    if (marker[0] !== MANAGED_REGION_START && marker[0] !== MANAGED_REGION_END) {
      invalid(`foreign-owner or malformed marker ${marker[0]}`)
    }
  }

  const starts = markers.filter(([marker]) => marker === MANAGED_REGION_START)
  const ends = markers.filter(([marker]) => marker === MANAGED_REGION_END)
  if (starts.length !== 1 || ends.length !== 1) invalid('duplicate or unmatched markers')

  const start = starts[0]?.index
  const end = ends[0]?.index
  if (start === undefined || end === undefined || start >= end) invalid('nested or reversed markers')
  return [start, end + MANAGED_REGION_END.length]
}

/** Replace only the owned region, or append it after one blank line when the file is unmanaged. */
export function projectManagedRegion(existing: string | undefined, body: string): string {
  const region = `${MANAGED_REGION_START}\n${body.trim()}\n${MANAGED_REGION_END}`
  if (existing === undefined || existing.length === 0) return `${region}\n`

  const bounds = validateMarkers(existing)
  if (bounds !== undefined) {
    return `${existing.slice(0, bounds[0])}${region}${existing.slice(bounds[1])}`
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n'
  return `${existing}${separator}${region}\n`
}
