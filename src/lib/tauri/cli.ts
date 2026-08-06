import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/**
 * Abertura pelo terminal (`alethe`, `alethe .`, `alethe <path>`) e instalação
 * do comando no PATH. Backend em `src-tauri/src/cli_launch.rs` e `cli_shim.rs`.
 */

/** Evento com o diretório pedido pelo terminal (app já aberto). */
const OPEN_PATH_EVENT = 'alethe://open-path'

export type CliShimStatus = {
  /** `false` onde não sabemos instalar o comando. */
  supported: boolean
  installed: boolean
  /** Instalado, mas apontando pro binário antigo (app movido/reinstalado). */
  stale: boolean
  path: string | null
  binDir: string | null
  /** O diretório do shim está no PATH — quando `false`, a UI mostra como somar. */
  onPath: boolean
}

/** O Rust serializa em snake_case; normalizamos na fronteira do IPC. */
type RawCliShimStatus = {
  supported: boolean
  installed: boolean
  stale: boolean
  path: string | null
  bin_dir: string | null
  on_path: boolean
}

function toCliShimStatus(raw: RawCliShimStatus): CliShimStatus {
  return {
    supported: raw.supported,
    installed: raw.installed,
    stale: raw.stale,
    path: raw.path,
    binDir: raw.bin_dir,
    onPath: raw.on_path,
  }
}

/**
 * Diretório pedido no cold start (`alethe <path>` com o app fechado). Consome
 * uma única vez no backend — chamadas seguintes devolvem `null`.
 */
export async function cliTakePendingOpen(): Promise<string | null> {
  return invoke<string | null>('cli_take_pending_open')
}

export async function cliShimStatus(): Promise<CliShimStatus> {
  return toCliShimStatus(await invoke<RawCliShimStatus>('cli_shim_status'))
}

export async function cliShimInstall(): Promise<CliShimStatus> {
  return toCliShimStatus(await invoke<RawCliShimStatus>('cli_shim_install'))
}

export async function cliShimUninstall(): Promise<CliShimStatus> {
  return toCliShimStatus(await invoke<RawCliShimStatus>('cli_shim_uninstall'))
}

export function listenCliOpenPath(handler: (path: string) => void): Promise<UnlistenFn> {
  return listen<string>(OPEN_PATH_EVENT, (event) => handler(event.payload))
}
