import { useEffect, useState } from 'react'

import { gitStatus } from '../../lib/tauri'

// cache por cwd + dedup de chamadas concorrentes (git_status é caro)
const branchCache = new Map<string, string | null>()
const branchInflight = new Map<string, Promise<void>>()

/** Lê o branch do repo no cwd via gitStatus (já existente). Defensivo: null se não for repo. */
export function useProjectBranch(cwd?: string): string | null {
  const [branch, setBranch] = useState<string | null>(() =>
    cwd ? (branchCache.get(cwd) ?? null) : null,
  )
  useEffect(() => {
    let alive = true
    if (!cwd) {
      setBranch(null)
      return
    }
    if (branchCache.has(cwd)) {
      setBranch(branchCache.get(cwd) ?? null)
      return
    }
    if (!branchInflight.has(cwd)) {
      const p = gitStatus(cwd)
        .then((st) => {
          branchCache.set(cwd, st.detached ? null : st.branch || null)
        })
        .catch(() => {
          branchCache.set(cwd, null)
        })
        .finally(() => {
          branchInflight.delete(cwd)
        })
      branchInflight.set(cwd, p)
    }
    void branchInflight.get(cwd)?.then(() => {
      if (alive) setBranch(branchCache.get(cwd) ?? null)
    })
    return () => {
      alive = false
    }
  }, [cwd])
  return branch
}
