/** Categoria de arquivo apontado por um link de path — decide o viewer no grid. */
export type FileLinkKind = 'markdown' | 'image' | 'text'

export type DetectedTerminalLink = {
  text: string
  index: number
  displayLength: number
  kind: 'url' | 'path'
  /** Só para `kind: 'path'` — que tipo de arquivo é, ou undefined se não parecer arquivo. */
  fileKind?: FileLinkKind
}

type TerminalBufferLine = {
  readonly isWrapped: boolean
  translateToString(trimRight?: boolean): string
}

type TerminalBuffer = {
  readonly length: number
  getLine(y: number): TerminalBufferLine | undefined
}

export type LogicalTerminalLine = {
  text: string
  startLine: number
}

const LINK_START_PATTERN = /https?:\/\/|(?:[A-Za-z]:\\|\\\\)|(?:~|\/)(?=[^/])/g
/** Sufixo `:linha` ou `:linha:coluna` que agents anexam a paths (ex.: `foo.ts:42:10`). */
const LINE_COL_SUFFIX = /:\d+(?::\d+)?$/
const MARKDOWN_EXT_PATTERN = /\.(md|markdown|mdx)$/i
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|webp|bmp|avif|ico|svg)$/i
const FILE_EXT_PATTERN = /\.[A-Za-z0-9]{1,12}$/
const LINK_TRAILING_PUNCTUATION = /[\s),.;:]+$/

/** Remove o sufixo `:linha:coluna` de um path pra obter o arquivo real. */
export function stripLineColumn(text: string): string {
  return text.replace(LINE_COL_SUFFIX, '')
}

/** Classifica um path pela extensão. `undefined` = não parece um arquivo abrível. */
export function classifyFileLink(text: string): FileLinkKind | undefined {
  const clean = stripLineColumn(text)
  if (MARKDOWN_EXT_PATTERN.test(clean)) return 'markdown'
  if (IMAGE_EXT_PATTERN.test(clean)) return 'image'
  if (FILE_EXT_PATTERN.test(clean)) return 'text'
  return undefined
}
const HARD_LINK_DELIMITERS = new Set(['\t', '\r', '\n', '<', '>', '"', "'", '`', '|'])

function findLinkEnd(line: string, start: number): number {
  const opener = line[start - 1]
  const closer = opener === '(' ? ')' : opener === '[' ? ']' : undefined
  if (closer) {
    const boundedEnd = line.indexOf(closer, start)
    if (boundedEnd !== -1) return boundedEnd
  }

  let end = start
  while (end < line.length) {
    const char = line[end]
    if (HARD_LINK_DELIMITERS.has(char)) break
    if (char === ' ' && line[end + 1] === ' ') break

    // A second link after whitespace belongs to a separate match.
    if (char === ' ') {
      const remainder = line.slice(end + 1)
      if (/^(?:https?:\/\/|[A-Za-z]:\\|\\\\|~\/|\/)/.test(remainder)) break
    }
    end += 1
  }
  return end
}

/** Detecta URLs e paths, preservando espaços que fazem parte do alvo. */
export function detectTerminalLinks(line: string): DetectedTerminalLink[] {
  const links: DetectedTerminalLink[] = []
  LINK_START_PATTERN.lastIndex = 0

  for (const match of line.matchAll(LINK_START_PATTERN)) {
    const index = match.index ?? 0
    if (links.some((link) => index < link.index + link.displayLength)) continue

    const raw = line.slice(index, findLinkEnd(line, index))
    const displayText = raw.replace(LINK_TRAILING_PUNCTUATION, '')
    if (!displayText) continue

    const kind = displayText.startsWith('http://') || displayText.startsWith('https://') ? 'url' : 'path'
    const text = kind === 'url' ? displayText : displayText.replace(/\\ /g, ' ')
    links.push({
      text,
      index,
      displayLength: displayText.length,
      kind,
      fileKind: kind === 'path' ? classifyFileLink(text) : undefined,
    })
  }
  return links
}

/**
 * Reconstrói a linha lógica do xterm. Linhas quebradas apenas pelo viewport têm
 * `isWrapped`; as intermediárias precisam manter o padding até `cols` para que
 * os offsets continuem correspondendo às coordenadas das células.
 */
export function getLogicalTerminalLine(
  buffer: TerminalBuffer,
  bufferLineNumber: number,
): LogicalTerminalLine | null {
  let startIndex = bufferLineNumber - 1
  if (startIndex < 0 || startIndex >= buffer.length || !buffer.getLine(startIndex)) return null

  while (startIndex > 0 && buffer.getLine(startIndex)?.isWrapped) startIndex -= 1

  let endIndex = startIndex
  while (endIndex + 1 < buffer.length && buffer.getLine(endIndex + 1)?.isWrapped) endIndex += 1

  let text = ''
  for (let index = startIndex; index <= endIndex; index += 1) {
    text += buffer.getLine(index)?.translateToString(index === endIndex) ?? ''
  }

  return { text, startLine: startIndex + 1 }
}

export function terminalLinkRange(
  startLine: number,
  columns: number,
  link: Pick<DetectedTerminalLink, 'index' | 'displayLength'>,
) {
  const startOffset = link.index
  const endOffset = link.index + link.displayLength - 1
  return {
    start: { x: (startOffset % columns) + 1, y: startLine + Math.floor(startOffset / columns) },
    end: { x: (endOffset % columns) + 1, y: startLine + Math.floor(endOffset / columns) },
  }
}
