# Handoff — Plataforma Multiagente do Alethe

> Documento de continuidade para outro agent retomar o trabalho. Contém o
> **objetivo principal**, o **estado atual (o que já foi feito e verificado)**,
> **o que falta (por RFC, em ordem de execução)**, as **regras inegociáveis**, os
> **gotchas já descobertos** e o **próximo passo concreto**.
>
> **Blueprint completo (fonte de verdade da arquitetura):**
> `C:\Users\miguel.porto\.claude\plans\acho-que-essa-idempotent-whale.md`
> (conjunto de RFCs 001–012). Leia-o antes de continuar.

---

## 1. Objetivo principal

Evoluir o **Alethe** (hoje um *dock de terminais* que spawna CLIs de agente —
Claude Code, Codex, OpenCode — como PTYs interativos) para uma **plataforma
multiagente** capaz de coordenar **dezenas→centenas de agentes em paralelo**, com
**conhecimento, planejamento e código evoluindo de forma sincronizada**.

Princípios fixos (decisões do dono):
1. **Graphify** (conhecimento) e **GSD / Get Shit Done** (planejamento) são
   **ferramentas EXTERNAS a integrar**, não reimplementar. O Alethe **gerencia,
   observa e coordena** — não vira um "clone pior" delas.
2. **Manter humano-no-terminal + coordenação por baixo.** O orquestrador NÃO
   dirige prompts autonomamente. *Única exceção:* os agentes efêmeros de
   resolução de conflito (nascem, resolvem, morrem).
3. **Isolamento em dois modos, por projeto:** `gitWorktree` (rápido) e
   `localCopy` (pesado/mais funcional).
4. **Merge Analyzer decide o conflito** — o agente de resolução nunca decide
   sozinho que há conflito.
5. **Arquitetura event-driven** (Event Bus desacopla os componentes).

**Fontes de verdade (sem sobreposição):** Graphify=conhecimento ·
GSD `.planning/`=planejamento · Git=código/histórico · Event Bus=fluxo ·
Scheduler=coordenação · Supervisor=saúde · Merge pipeline=integração segura.

**Insight central:** Graphify e GSD rodam *dentro* do CLI de agente (filesystem +
MCP/slash-commands). O build nativo pesado do Alethe é o **isolamento + a malha de
coordenação event-driven**.

---

## 2. Estado atual (o que JÁ está feito e verificado)

### ✅ RFC-003 — Worktree Manager (dual-mode) — backend + ponte IPC
Primeiro incremento da Fase 1, **implementado e testado** (sem UI ainda).

- **`src-tauri/src/worktrees.rs`** (novo): comandos
  `worktree_provision`, `worktree_list`, `worktree_remove`, `worktree_cleanup`.
  - `WorktreeMode::GitWorktree` → `git worktree add -b alethe/agent-<id> <dest> HEAD`
    em `<repo>/.alethe/worktrees/<id>/` (compartilha `.git`).
  - `WorktreeMode::LocalCopy` → `git clone --local <repo> <dest>` + `checkout -b`
    (repo independente por hardlinks).
  - Distinção de modo: `.git` **arquivo** = worktree; **diretório** = cópia local.
  - Segurança: `sanitize_id` (só `[A-Za-z0-9_-]`) e remoção com dupla trava
    (canonicaliza + exige estar dentro de `.alethe/worktrees`).
  - `git_arg()` remove o prefixo verbatim `\\?\` do Windows ao passar caminhos
    como ARGUMENTO ao git (ver Gotcha #1).
  - Testes unitários: `rejects_unsafe_ids`, `provisions_lists_and_removes_both_modes` — **2/2 ok**.
- **`src-tauri/src/git_control.rs`**: `git_command`, `checked_output`,
  `repository_root` viraram `pub(crate)` para reuso (nada mais mudou).
- **`src-tauri/src/lib.rs`**: `mod worktrees;` + 4 comandos no `invoke_handler`.
- **`src/lib/tauri.ts`**: wrappers `worktreeProvision/List/Remove/Cleanup` +
  tipos `WorktreeMode` (`'gitWorktree' | 'localCopy'`) e `WorktreeInfo`.

### ✅ RFC-001 — Event Bus & Observabilidade — backend + ponte Tauri + telemetria
Segundo incremento da Fase 1, **implementado e testado**.

- **`src-tauri/src/event_bus.rs`** (novo): Barramento de eventos global baseado em `tokio::sync::broadcast`.
  - Define `EventBusPayload` unificando eventos como `Task*`, `Agent*`, `Merge*`, `Graph*`, etc. com `correlation_id` e dados adicionais em JSON.
  - Comando `publish_event` exposto ao frontend.
- **`src-tauri/src/telemetry.rs`** (novo): Anexa eventos recebidos no barramento em formato JSONL no arquivo local `telemetry.jsonl` na pasta de logs.
  - Acumula métricas dinâmicas em memória (ex: contagem por tipo de evento) e extrai métricas numéricas (`duration_ms`, `cost_usd`, `memory_mb`).
  - Mantém histórico circular em memória de até 500 traces pesquisáveis por `correlation_id`.
  - Comandos `get_telemetry_metrics` e `get_telemetry_traces` expostos.
- **`src-tauri/src/lib.rs`**: Registro de módulos, inicialização de listeners do bus emitindo para o canal do frontend `event-bus-event`, e inicialização da telemetria no `.setup()`.
- **`src/lib/tauri.ts`**: Tipagens Typescript de eventos e wrappers do Tauri (`publishEvent`, `getTelemetryMetrics`, `getTelemetryTraces` e listener `listenEventBus`).

**Verificação feita:** `cargo check` (exit 0), `npx tsc --noEmit` (ok), testes unitários em `event_bus` e `telemetry` rodando com sucesso. **Nada foi commitado.**

### ✅ RFC-004 — Graphify (conhecimento do código) — backend + viz Cytoscape + versionamento
Fase 4, **implementado e testado**. Trata o Graphify como ferramenta EXTERNA (o
Alethe gerencia/observa, não reimplementa).

- **`src-tauri/src/graphify.rs`** (novo) — 8 comandos:
  - **Integração MCP:** `graphify_detect` (roda `<cmd> --version`) e
    `graphify_mcp_config_path` (escreve um `.mcp` `{mcpServers:{graphify:{command,args}}}`
    em temp, por projeto, para injetar via `--mcp-config`). O comando/args exatos do
    CLI ficam concentrados em `mcp_server_spec` (ponto único a ajustar quando a fonte
    oficial for pinada).
  - **Leitura/normalização:** `graphify_read_graph` lê `graphify-out/graph.json`,
    tolera formatos NetworkX (`nodes`/`links`) e variações (`edges`), infere
    label/kind/group de vários campos, e trunca em `MAX_VIZ_NODES=3000` (descarta
    arestas órfãs) para não matar a WebView.
  - **Versionamento + memory policy:** `graphify_snapshot`/`_list_snapshots`/
    `_diff_snapshot`/`_rollback` em `<repo>/.alethe/graph-snapshots/<ts>.json` +
    `graphify_prune_snapshots(keep_last, max_age_days)`. Emite `GraphSnapshotted`/
    `GraphUpdated` no Event Bus. `snapshot_file` valida id numérico (anti path-traversal).
  - Testes: `reads_and_normalizes_graph`, `snapshot_list_diff_rollback_and_prune`,
    `rejects_forged_snapshot_id` — **3/3 ok**.
- **`src-tauri/src/git_control.rs`:** `hide_console` virou `pub(crate)` (reuso na detecção).
- **`src-tauri/src/lib.rs`:** `mod graphify;` + 8 comandos no `invoke_handler`.
- **`src/lib/tauri.ts`:** wrappers + tipos (`GraphData`, `GraphNode/Edge`,
  `GraphSnapshotInfo`, `GraphDiff`, `GraphifyStatus`).
- **`src/lib/sessionLaunch.ts`:** `buildAgentLaunch` ganhou param opcional
  `mcpConfigPath` → injeta `--mcp-config <path>` no **Claude Code** (retrocompatível).
- **`src/stores/graphifyStore.ts`** (novo): estado da viz (graph/snapshots/status) + ações.
- **`src/components/GraphifyView/`** (novo): viz interativa com **Cytoscape**
  (layout `cose`), reload/snapshot/prune, sidebar de snapshots com rollback. Cores lidas
  dos tokens de tema via `getComputedStyle` (respeita o design system); i18n em `graphify.*`.
- **`package.json`:** adicionadas deps diretas `cytoscape` + `@types/cytoscape` (já estava
  no bundle via mermaid; agora importável).

**Verificação:** `cargo test --lib graphify` (3/3), `npx tsc --noEmit` (ok, i18n validado),
`npx vite build` (ok — `cytoscape.esm` no bundle). **Nada foi commitado.**

**O que FALTA na RFC-004 (follow-ups):**
1. **Montar a `GraphifyView` no shell da UI** — o componente é prop-driven
   (`repo`, `projectId`) mas ainda não está plugado em nenhum painel/aba/modal.
2. **Chamar `graphifyMcpConfigPath` + passar `mcpConfigPath` ao spawn** — a injeção existe
   em `buildAgentLaunch`, mas o pipeline de spawn (XTermView/TerminalPane) ainda não a usa;
   ligar quando `graphifyEnabled` do projeto estiver on (depende do config v5 — RFC-009).
3. **Codex/OpenCode MCP** — hoje só o Claude recebe `--mcp-config`; os outros usam
   mecanismos próprios de MCP (evolução).
4. **Confirmar o formato real do `graph.json`** e os args reais do `graphify --mcp` ao pinar
   a fonte oficial (`safishamsi/graphify`); ajustar `mcp_server_spec`/normalização se preciso.
5. **Auto-snapshot por evento** — ✅ feito na Fase 3: `merge_finalize` dispara
   `graphify_snapshot` (best-effort) após cada integração.

### ✅ Fase 3 — Ciclo de Merge Seguro (RFC-006 + RFC-007 + RFC-008) — backend completo
**Implementado e testado end-to-end** (27/27 na suite Rust). O worktree do usuário
NUNCA é tocado até o fast-forward final.

Fluxo implementado:
`merge_analyze (ensaio) → merge_prepare (env efêmero + prompt) → [agente resolve] →
merge_finalize (marcadores → Validation Pipeline → commit → --ff-only → teardown)`.

- **`src-tauri/src/merge_analyzer.rs`** (novo, RFC-006):
  - `merge_analyze(repo, source, target)`: ensaio de merge em worktree descartável
    (`.alethe/merge-envs/analyze-<id>`), lista arquivos em conflito
    (`diff --diff-filter=U`), aborta e remove o ensaio. Publica `MergeClean`/`MergeConflict`.
  - **Conflict Classifier**: `classify_path` → `ConflictClass`
    (Rust/TypeScript/Ui/Cargo/Package/Json/Config/Asset/Planning/Graph/Other) por
    extensão + paths especiais (`.planning/`, `graphify-out/`, lockfiles/manifests).
  - `class_strategy(class)`: estratégia textual por classe (ex.: lockfile → regenerar,
    não editar; asset → checkout --theirs/--ours; graph → escolher lado e regenerar).
    É a fonte única usada também no prompt do agente.
- **`src-tauri/src/conflict_resolution.rs`** (novo, RFC-007):
  - `merge_prepare`: worktree efêmero `alethe/merge-<id>` a partir do target +
    `merge --no-commit source` (deixa marcadores reais). Escreve `ALETHE_CONFLICT.md`
    (contexto mínimo: branches, arquivos+classe+estratégia, regras "NUNCA implemente
    features / preserve as duas intenções / não commite"). Metadados em
    `merge-envs/<id>.json` (FORA do worktree, para não contaminar o commit).
    Se o merge é limpo, `clean=true` e não há prompt — vai direto ao finalize.
  - **O agente efêmero é spawnado pelo FRONT** (provider-agnóstico, cwd=env.path)
    — o backend só provisiona/valida/finaliza, preservando o modelo PTY.
  - `merge_finalize` (gate, integra RFC-008): remove o prompt → varre marcadores
    restantes (`<<<<<<<`/`>>>>>>>`) nos arquivos que estavam em conflito → `add -A`
    + checa unmerged → roda `validation::run_validation` no ambiente → commita
    `merge(alethe): src -> tgt` → exige target checked-out no repo e integra com
    `merge --ff-only` → teardown (worktree+branch+meta) → `graphify_snapshot`
    automático (amarra RFC-004). Qualquer falha PRESERVA o ambiente para retry e
    retorna `MergeOutcome{merged:false, stage, output}`.
  - `merge_abort`: destrói o ambiente sem integrar. Ids validados (anti-traversal).
  - Eventos: `MergeRequested/MergeConflict/MergeValidated/MergeValidationFailed/
    MergeMerged/MergeAborted` no Event Bus.
- **`src-tauri/src/worktrees.rs`:** `git_arg` virou `pub(crate)` (reuso).
- **`src-tauri/src/lib.rs`:** 2 módulos + 4 comandos registrados.
- **`src/lib/tauri.ts`:** tipos `ConflictClass/ConflictFile/MergeAnalysis/ConflictEnv/
  MergeOutcome` + wrappers `mergeAnalyze/mergePrepare/mergeFinalize/mergeAbort`.
- **Testes (5):** classificação; ensaio detecta conflito e não deixa lixo; ciclo
  completo (barrado por marcador → barrado por validação falha → merge ok com ff no
  alvo + teardown + branch temporário removido); merge limpo integra sem agente;
  abort destrói o env e rejeita id forjado.

**Fase 3 — front TAMBÉM feito (ciclo completo dirigido pela UI):**
- **`src/stores/mergeStore.ts`** (novo): orquestra
  `analyze → prepare → [conflito? spawna agente efêmero] → finalize/abort`.
  O agente efêmero roda num **Terminal VISÍVEL do projeto** (`createTerminal` com
  `cwd=env.path` + prompt inicial que aponta pro `ALETHE_CONFLICT.md` e trava o
  escopo) — autônomo mas humano-observável. Provider vem de
  `project.conflictAgentProvider` (novo campo + setter no `projectsStore`).
  Merge limpo pula o agente; sucesso deleta o terminal efêmero; falha preserva
  ambiente+terminal para retry; toasts em cada transição.
- **`git_list_branches`** novo em `git_control.rs` (+ wrapper `gitListBranches`).
- **UI no `EditProjectModal`**: seção "Ciclo de merge" (selects de source/target,
  Analisar com lista de conflitos+classe, Iniciar/Finalizar/Abortar por fase) +
  select do **provider do agente de conflito** na seção multi-agent. i18n `merge.*`
  (en+pt-BR). `merge_finalize` usa `project.validationCommands` (config por projeto
  já existente).

**O que AINDA falta na Fase 3:**
1. **Skills de merge especializadas embarcadas** (`.claude/agents/merge-<classe>.md`
   via padrão `agent_library.rs`) — hoje a estratégia por classe vai inline no prompt.
2. **Auto-finalize** — detectar o fim do agente (pty://exit / completionMonitor) e
   chamar `mergeFinalize` sozinho; hoje o usuário clica "Finalizar merge".
3. **Consumir plugins `validationPipeline`/`skill`** no ciclo (RFC-012).

### O que já existia no Alethe e será reutilizado (mapa rápido)
- **PTY/runtime:** `src-tauri/src/pty.rs` (`spawn_pty`, `restart_pty`, `kill_pty`,
  `list_pty_processes`, scrollback em disco), eventos `pty://data/{id}` / `pty://exit/{id}`.
- **Spawn serial:** `src/lib/spawnQueue.ts` (semáforo, base para o `TaskLease`).
- **POC de orquestração:** `src-tauri/src/agent_events.rs` (listener HTTP em
  127.0.0.1:9123-9143 que recebe hooks do Claude e reemite `agent-hook`;
  `agent_hooks_settings_path` escreve settings do agente; rota `/spawn`) +
  `src/stores/agentCanvasStore.ts` + `src/components/AgentCanvasPOC/`.
- **Git single-repo:** `src-tauri/src/git_control.rs` (status/stage/commit/push/pull).
- **Sessões/custo:** `claude_sessions.rs`, `codex_sessions.rs`,
  `opencode_sessions.rs`, `agent_cost.rs` + `src/stores/agentCostStore.ts`.
- **Skills/subagents:** `agent_library.rs`, `economy_agents.rs` (padrão de escrever
  `.claude/agents/*.md` — reutilizar para as skills de merge e conflito).
- **CLIs:** `cli_resolver.rs` (resolve binários no Windows). `AgentType` em
  `src/lib/types.ts` = `shell | claude | codex | opencode | freebuff | mimo`.
- **Config persistida:** `src-tauri/src/projects.rs` + `projects.json` (schema
  versionado **v4** em `src/lib/types.ts`, `ProjectsFile`). **Grafo de viz já no
  bundle:** `cytoscape.esm` (reusar para visualizar `graph.json`).

---

## 3. O que FALTA (por RFC, em ordem de execução)

Ordem aprovada (fatiamento). Cada RFC deve virar um arquivo próprio em
`docs/rfcs/RFC-00X-*.md` na Fase 0.

### Fase 1 (fundação) — em andamento
- **RFC-003 (falta a UI):** seção de Configurações "Worktrees" + provisionamento
  visual dos dois modos. *(Backend pronto — ver §2.)*
- **RFC-009 — Configuration System:** seção "Worktrees" concentrando TODA a config
  de dev paralelo (modos + modo padrão por projeto, políticas de criação/limpeza,
  limite de concorrência, comportamento de merge, provider/modelo do agente de
  conflito, etapas da Validation Pipeline, snapshot/compactação do Graphify,
  priorização do Scheduler, logs/auditoria). **Migração `projects.json` v4 → v5**
  (manter migração/backfill; adicionar `worktreeMode` por projeto e
  `envPath`/`branch`/`taskId`/`graphifyEnabled` por terminal/agente).

### Fase 2 (coordenação)
- **RFC-002 — Scheduler, Task DAG & Priorização:** `scheduler.rs` +
  `src/stores/schedulerStore.ts`. `Scheduler → Task Queue → Agent Pool →
  Provisioning`. Consulta **Task DAG** (dependências das ondas do GSD) antes de
  liberar. Priorização combinável (criticidade, deps prontas, custo estimado via
  `agentCostStore`, especialização, balanceamento, deadlines, cancelamentos).
  **TaskLease** por tarefa/recurso (estende `spawnQueue.ts`).
- **RFC-010 — Agent Supervisor & Failure Recovery:** `supervisor.rs`
  (heartbeat/timeout/restart/retry/kill/logs; reusa `list_pty_processes`,
  `restart_pty`, `kill_pty`). **Política de recuperação:** retry com backoff até N
  → tarefa volta à fila → bloqueada (deps/recurso) → notifica usuário.

### Fase 3 (integração — o ciclo de merge seguro) — ✅ BACKEND FEITO (ver §2)
Restam só os follow-ups listados em §2 (spawn do agente no front, skills embarcadas,
UI do ciclo, validação configurável). Texto original da fase para referência:
- **RFC-006 — Merge Pipeline:** `merge_analyzer.rs`. Fluxo:
  `Agent A/B done → Merge Analyzer → conflito? ─não→ RFC-008 → Merge ; ─sim→
  Conflict Classifier → skill adequada → RFC-007 → RFC-008 → Merge`.
  **Conflict Classifier** por tipo (Rust/TS/UI/Cargo/package.json/assets/JSON/
  config/Graphify/GSD). **Skills de merge especializadas** (registro:
  `Rust Merge`, `TS Merge`, `UI Merge`, `Cargo Merge`, `Package Merge`,
  `Asset Merge`, `Config Merge`, `Android/Electron Merge`) — padrão
  `agent_library.rs`/`economy_agents.rs`, embarcadas, zero-config, gatilho automático.
- **RFC-007 — Conflict Resolution Agent (efêmero, provider-agnóstico):**
  `conflict_resolution.rs`. Nasce só para aquela integração, ambiente isolado, sem
  memória, contexto mínimo (diffs das branches, arquivos conflitantes, contexto do
  conflito, planejamento da tarefa, deps), resolve → valida → confirma que nada se
  perdeu → mergeia → **destruído**. Nunca implementa feature/muda requisito/arquitetura.
  Provider-agnóstico = qual CLI o Alethe spawna (reusa `AgentType`+`cli_resolver.rs`).
  *(Única exceção autônoma ao humano-no-loop.)*
- **RFC-008 — Validation Pipeline:** `validation.rs`. Antes de todo merge:
  `Lint → Build → Unit → Integration → Smoke → UI Validation` usando a toolchain do
  projeto (`tsc --noEmit`, `vite build`, `npm test`) + validação de UI (motivada por
  regressão de ícone). Só mergeia se passar; publica `MergeValidated`. Etapas configuráveis.

### Fase 4 — RFC-004 — Graphify
`graphify.rs` gerencia `graphify … --mcp` por projeto (binário via `cli_resolver.rs`,
exige Python). Injeta o MCP no ambiente do agente (estende `sessionLaunch.ts` +
`agent_hooks_settings_path`). Viz de `graph.json` **reusando `cytoscape.esm` do
bundle**. **Versionamento** (snapshot/diff/rollback de `graphify-out/`) e
**Memory Policy** (quando resumir/compactar/arquivar).

### Fase 5 — RFC-005 — GSD — ✅ AUDITORIA FEITA (ver abaixo)
**Feito** (em `src-tauri/src/planning.rs`, além do watcher que já existia):
- `planning_audit_record(repo, agent_id?, reason?, project_id?)`: commita SOMENTE o
  `.planning/` (`git commit -- .planning`, escopado — mudanças staged de fora não
  entram), com subject `gsd(alethe): <motivo>` + trailer `Alethe-Agent: <id>`.
  Retorna `null` quando não há mudanças. Emite `PlanningCommitted` no bus.
- `planning_audit_history(repo, limit)`: git log parseado do `.planning/`
  (hash/autor/quando/motivo/agente via `%(trailers:key=Alethe-Agent)`), separadores
  ASCII 0x1e/0x1f (imune a mensagens com caracteres comuns). Repo sem commits → `[]`.
- **Auto-commit event-driven (opt-in):** `start_planning_autocommit_loop()` (ligado
  no setup) reage a `PlanningUpdated` do watcher com debounce por geração (2s) e
  chama `audit_record`. Desligado por default (auto-commit no repo do usuário é
  intrusivo) — liga via `set_planning_autocommit(true)`.
- Front: `planningAuditRecord/History`, `setPlanningAutocommit` + tipo `PlanningCommit`.
- Teste: `records_scoped_audit_commit_with_agent_trailer` (commit escopado, trailer
  no histórico, None sem mudanças).

**Falta na RFC-005:** graduar o POC (`agentCanvasStore`) para o painel de
fases/ondas/tarefas do GSD lendo `.planning/`; derivar o **Task DAG real** do
conteúdo (hoje o scheduler usa um DAG próprio); UI do histórico de auditoria.

### Transversais — RFC-011 (Observabilidade) e RFC-012 (Plugin System)
- **RFC-011 (parcial via RFC-001):** métricas/traces/logs básicos existem em
  `telemetry.rs`. Falta: painel/Dashboard, métricas derivadas (taxa de conflito,
  latência por etapa) e export.
- **RFC-012 — ✅ NÚCLEO FEITO** (`src-tauri/src/plugins.rs`):
  - Plugins = manifests JSON em `<perfil>/plugins/<id>/plugin.json` com
    `{id, name, version, kind, description, spec}`; `kind` ∈
    `agentType | skill | validationPipeline`; `spec` é formato livre interpretado
    pelo consumidor (núcleo só armazena/lista/emite eventos).
  - Comandos `plugins_list(kind?)`, `plugin_install`, `plugin_uninstall` +
    eventos `PluginInstalled`/`PluginRemoved` no bus. Ids validados
    (anti-traversal); manifest corrompido é ignorado na listagem; reinstalar o
    mesmo id = upgrade (sobrescreve).
  - Front: `pluginsList/pluginInstall/pluginUninstall` + tipos `PluginKind`/
    `PluginManifest`. Teste: `installs_lists_filters_and_uninstalls`.
  - **Falta na RFC-012:** os CONSUMIDORES — provisioner honrar `agentType`
    plugados, `merge_prepare` usar skills `skill` instaladas no prompt/registro, e
    `merge_finalize` aceitar `validationPipeline` como fonte dos comandos; UI de
    gerenciamento de plugins.

---

## 4. Regras inegociáveis (do CLAUDE.md — NÃO violar)

1. **NÃO reiniciar/matar o app nem o dev server** (`tauri dev`/Vite). Aplicar via
   HMR. Para verificar backend, use `cargo check`/`cargo test`
   (`--manifest-path src-tauri/Cargo.toml`), nunca subir o app.
2. **NÃO commitar/push/tag/release sem permissão explícita na hora.** Trabalhar só
   no working tree. Quando autorizado, **sem** `Co-Authored-By` nem assinatura.
3. **Design system estrito** — sem gradientes, sem UI "vibecoded", dado real
   (nunca mock). Cores só via tokens de `src/styles/theme.css` (`--bg`, `--fg`,
   `--accent`, `--agent-*`, `--status-*`…), 1 `.module.css` por componente.
4. **i18n obrigatório** — toda string visível passa por `t()`; registrar chave em
   `src/lib/i18n/messages/en.ts` (fonte da verdade) **e** `pt-BR.ts` (tipado; o
   `npm run build` falha se faltar tradução).
5. **`projects.json` versionado** — ao mudar shape, manter migração/backfill (v4→v5).

---

## 5. Gotchas já descobertos (economize tempo)

1. **Windows verbatim path `\\?\`:** `repository_root` canonicaliza para
   `\\?\D:\…`. O `git` aceita isso como `current_dir`, mas **quebra quando vem como
   ARGUMENTO** (destino de `worktree add`/`clone`). Solução: `git_arg()` em
   `worktrees.rs` remove o prefixo (`\\?\` e `\\?\UNC\`). Reutilizar esse helper em
   qualquer módulo novo que passe caminhos ao git.
2. **`npm run build` falha no PowerShell 5.1** do ambiente (usa `&&`, inválido nessa
   shell). Rode separado: `npx tsc --noEmit` e depois `npx vite build`.
3. **Reuso de helpers do git_control:** já são `pub(crate)`
   (`git_command`, `checked_output`, `repository_root`). Prefira-os a reescrever a
   resolução/validação de repositório.
4. **`cytoscape.esm` já está no bundle** (visto no output do `vite build`) — use-o
   para a viz do grafo (RFC-004), não adicione lib nova.
5. **`agent_events.rs` já tem a ponte HTTP + `/spawn`** e o `agentCanvasStore` já
   modela nós/tarefas de subagente — a RFC-005 deve **graduar** isso, não recomeçar.
6. **Warnings pré-existentes** de `dead_code` (ex.: `WebRect`) no `cargo check` não
   são do nosso código — ignore.

---

## 6. Como verificar (sem subir o app)

- Backend: `cargo check --manifest-path src-tauri/Cargo.toml` e
  `cargo test --manifest-path src-tauri/Cargo.toml --lib <modulo>`.
- Front: `npx tsc --noEmit` e `npx vite build`.
- Cada RFC tem critérios end-to-end no blueprint (seção "Verificação").

---

## 7. Decisões em aberto (confirmar com o dono antes de implementar)

- **Pinar fontes oficiais:** Graphify (`safishamsi/graphify`, PyPI `graphifyy`) e
  GSD (`gsd-build/get-shit-done`). ⚠️ **Há aviso de comunidade sobre fork malicioso
  ("crypto scam") do GSD** — validar maintainer/instalador antes de qualquer setup.
- **Modo B (LocalCopy):** hoje é `git clone --local` (hardlinks). Falta decidir se
  haverá opção de **cópia crua** que replica estado não-versionado
  (`node_modules`/build) — mais pesada. Está marcado como evolução no código.
- **Provider-agnóstico:** definir a lista de CLIs suportados para o agente de
  conflito e como passar o modelo a cada um.
- **Runtime externo:** Graphify exige Python; GSD exige Node + ~50 `.md`. O Alethe
  instala/gerencia ou só detecta?

---

## 8. Próximo passo concreto (recomendado)

1. **Subir a UI mínima de Worktrees** (fecha a RFC-003) combinando com a estruturação do **System Configuration / migração para v5 (RFC-009)**. Ambas completam a Fase 1 (Fundação).
2. Conectar a UI aos novos eventos do **Event Bus (RFC-001)** para publicar logs ou traces em tempo real conforme as ações de Worktree ocorrem.
3. Antes de codar RFC-004/005, **pinar as fontes oficiais** (decisão em aberto).
4. Manter o padrão deste incremento: módulo Rust + comando registrado em `lib.rs` + wrapper em `tauri.ts` + teste unitário + `cargo test`/`tsc`; i18n e tokens de tema para qualquer UI; **nada commitado sem permissão**.

