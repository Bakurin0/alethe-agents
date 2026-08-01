/**
 * Helpers de caminho compartilhados. Antes o idioma `split(/[\\/]/)` estava
 * copiado em ~13 lugares com variações sutis; centralizado aqui pra ter um
 * comportamento único. Lida com separador Windows (`\`) e POSIX (`/`).
 *
 * Para comparação de cwd entre plataformas use `normalizeCwd`/`sameCwd` (a
 * normalização de caixa/separador vive em `platform.ts`, reexportada aqui).
 */

import { normalizeCwd } from './platform'

export { normalizeCwd }

/** Segmentos não vazios de um caminho (colapsa separadores repetidos e finais). */
export function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean)
}

/** Último segmento do caminho (nome do arquivo/pasta). '' se o caminho for vazio. */
export function basename(path: string): string {
  const segments = pathSegments(path)
  return segments[segments.length - 1] ?? ''
}

/** True se dois caminhos apontam pro mesmo lugar (normalização cross-plataforma). */
export function sameCwd(a: string, b: string): boolean {
  return normalizeCwd(a) === normalizeCwd(b)
}
