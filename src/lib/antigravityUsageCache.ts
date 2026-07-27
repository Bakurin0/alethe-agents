import { getAntigravityUsage, type AntigravityUsage } from './tauri'

const TTL_MS = 60_000

let cached: { value: AntigravityUsage; at: number } | null = null
let inFlight: Promise<AntigravityUsage> | null = null

export function getCachedAntigravityUsage(force = false): Promise<AntigravityUsage> {
  const now = Date.now()
  if (!force && cached && now - cached.at < TTL_MS) {
    return Promise.resolve(cached.value)
  }
  if (!force && inFlight) return inFlight

  inFlight = getAntigravityUsage()
    .then((value) => {
      cached = { value, at: Date.now() }
      return value
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
