/**
 * Detecção de plataforma para a WebView. Usado para decidir o backend de
 * terminal: macOS pode usar o backend nativo (Ghostty); Windows/Linux seguem
 * sempre no xterm.js.
 *
 * Evitamos o @tauri-apps/plugin-os (dependência extra + chamada async) — o
 * user-agent da WKWebView no macOS é estável e suficiente para essa decisão.
 */
export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // WKWebView no macOS sempre traz "Macintosh" / "Mac OS X" no UA.
  return /Macintosh|Mac OS X/i.test(ua)
}

/**
 * Decide se um terminal deve usar o backend nativo (Ghostty) em vez do
 * xterm.js. Regra única, testável: só no macOS E com a flag opt-in ligada.
 * `macOverride` permite testar a lógica sem depender do user-agent real.
 */
export function shouldUseNativeBackend(
  nativeTerminalMacos: boolean | undefined,
  macOverride: boolean = isMacOS(),
): boolean {
  return Boolean(nativeTerminalMacos) && macOverride
}

/**
 * Normaliza um cwd para comparação cross-plataforma: remove barra final e,
 * só quando o path parece Windows (letra de drive, ex: "C:\..."), uniformiza
 * separador (`\`) e caixa. Fora disso (Linux/macOS) deixa caminho intacto —
 * o filesystem lá é case-sensitive e lowercasear cegamente pode colidir dois
 * diretórios diferentes (ex: `/home/user/Project` vs `/home/user/project`).
 *
 * Também remove o prefixo verbatim `\\?\` do Windows (e sua variante UNC,
 * `\\?\UNC\`) ANTES do teste de drive-letter — sem isso, um cwd de worktree
 * canonicalizado (`\\?\D:\...`) nunca batia com o path "normal" que o próprio
 * CLI do agente reporta em sua própria lista de sessões, então a sessão nunca
 * era encontrada/reivindicada (raiz do mesmo bug já corrigido no backend em
 * `worktrees::git_arg`).
 */
export function normalizeCwd(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, '')
  const unprefixed = trimmed.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '')
  if (/^[a-z]:/i.test(unprefixed)) return unprefixed.replace(/\//g, '\\').toLowerCase()
  return unprefixed
}

/**
 * Formata um atalho de teclado escrito na convenção Windows/Linux
 * ("Ctrl+Shift+P") para os glifos do macOS ("⌘⇧P") quando `isMacOS()` — em
 * qualquer outra plataforma retorna o texto original sem alteração.
 */
export function formatShortcut(shortcut: string, mac: boolean = isMacOS()): string {
  if (!mac) return shortcut
  return shortcut
    .replace(/Ctrl\+/gi, '⌘')
    .replace(/Shift\+/gi, '⇧')
    .replace(/Alt\+/gi, '⌥')
}
