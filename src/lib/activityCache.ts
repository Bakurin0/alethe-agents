import { getMultiAgentActivity, type ActivityDay } from './tauri'

const TTL_MS = 5 * 60_000

let cached: { days: number; value: ActivityDay[]; at: number } | null = null
let inFlight: Promise<ActivityDay[]> | null = null

/** Atividade combinada de Claude + Codex + OpenCode (ver get_multi_agent_activity
 * em claude_sessions.rs). */
export function getCachedActivity(days: number, force = false): Promise<ActivityDay[]> {
  const now = Date.now()
  if (!force && cached && cached.days === days && now - cached.at < TTL_MS) {
    return Promise.resolve(cached.value)
  }
  if (!force && inFlight) return inFlight

  inFlight = getMultiAgentActivity(days)
    .then((value) => {
      cached = { days, value, at: Date.now() }
      return value
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
