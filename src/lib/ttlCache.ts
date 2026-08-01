/**
 * Cache TTL com de-dupe de requisições em voo. Mantém um único valor em cache;
 * enquanto uma busca está em andamento, chamadas concorrentes reusam a mesma
 * promise (evita disparar N requisições iguais). `force` ignora o cache e o
 * in-flight e refaz a busca.
 *
 * Colapsa o padrão antes copiado em claudeUsageCache/codexUsageCache/
 * antigravityUsageCache (sem chave) e activityCache (com chave `days`).
 */

/** Cache de um valor sem parâmetro (ex.: uso do Claude/Codex/Antigravity). */
export function makeTtlCache<T>(
  fetcher: () => Promise<T>,
  ttlMs: number,
): (force?: boolean) => Promise<T> {
  let cached: { value: T; at: number } | null = null
  let inFlight: Promise<T> | null = null

  return (force = false) => {
    const now = Date.now()
    if (!force && cached && now - cached.at < ttlMs) {
      return Promise.resolve(cached.value)
    }
    if (!force && inFlight) return inFlight

    inFlight = fetcher()
      .then((value) => {
        cached = { value, at: Date.now() }
        return value
      })
      .finally(() => {
        inFlight = null
      })

    return inFlight
  }
}

/**
 * Cache parametrizado por uma chave (ex.: atividade por `days`). Um valor por
 * vez: uma chave diferente invalida o cache anterior — igual ao comportamento
 * original do activityCache.
 */
export function makeKeyedTtlCache<K, T>(
  fetcher: (key: K) => Promise<T>,
  ttlMs: number,
): (key: K, force?: boolean) => Promise<T> {
  let cached: { key: K; value: T; at: number } | null = null
  let inFlight: { key: K; promise: Promise<T> } | null = null

  return (key: K, force = false) => {
    const now = Date.now()
    if (!force && cached && cached.key === key && now - cached.at < ttlMs) {
      return Promise.resolve(cached.value)
    }
    if (!force && inFlight && inFlight.key === key) return inFlight.promise

    const promise = fetcher(key)
      .then((value) => {
        cached = { key, value, at: Date.now() }
        return value
      })
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null
      })

    inFlight = { key, promise }
    return promise
  }
}
