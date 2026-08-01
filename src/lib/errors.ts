/**
 * Helpers de erro compartilhados. O backend Tauri rejeita com strings no
 * formato `"code: mensagem"`; estes helpers normalizam isso pra exibição.
 */

/** Mensagem legível de qualquer erro (Error, string, ou valor cru). */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Remove o prefixo `código:` das rejeições do backend, sobrando só a mensagem. */
export function readableError(error: unknown): string {
  const value = messageOf(error)
  const separator = value.indexOf(':')
  return separator >= 0 ? value.slice(separator + 1).trim() : value
}

/** No-op pra `.catch(ignore)` — deixa explícito que a falha é intencionalmente ignorada. */
export function ignore(): void {}
