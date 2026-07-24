# BACKUP — Handoff da sessão autônoma (integração OpenCode + polimento de UI)

> Gerado automaticamente ao final de uma sessão de trabalho autônomo (o dono pediu
> pra eu implementar tudo, criar um repositório de backup e documentar aqui —
> sem parar pra perguntar nada, com decisões documentadas em vez de confirmadas
> ao vivo). Ele estava viajando e pediu explicitamente pra este arquivo **não**
> ser o `CLAUDE.md` do projeto (esse fica intocado).

Branch: `feat/merge-worktree-robustness-graphify-multiprovider`
Plano original (na máquina local, fora do repo): `C:\Users\miguel.porto\.claude\plans\zippy-mapping-shamir.md`

---

## 1. O que foi pedido

Duas frentes fundidas na mesma sessão:

1. **PR #26** (`https://github.com/Kc1t/alethe-agents/pull/26`) — robustez de
   merge/worktrees + graphify multi-provider. **Já estava pronto e mergeável**
   antes desta parte autônoma começar (43/43 testes Rust, rebase feito em cima
   do commit real do dono do repo `Kc1t`).
2. **Esta sessão autônoma** — "sinto que o opencode tá bem defasado, preciso
   melhorar totalmente a integração" + uma sequência de bugs de UI reportados
   ao vivo por screenshot + "quero testes automatizados... com validação total
   do procedimento feito pela IA do opencode". O dono autorizou trabalho
   totalmente autônomo (implementar tudo, nunca perguntar, decidir sozinho nos
   pontos ambíguos, documentar aqui, e no final criar um repo de backup e dar
   push) porque ia viajar.

---

## 2. Status por incremento

| # | O quê | Status |
|---|-------|--------|
| 1 | Sinal real de working/idle do OpenCode (plugin global) | ✅ Implementado |
| 2 | Corrigir bugs de custo/pricing do OpenCode | ✅ Implementado (achou bug maior que o previsto — path do banco errado) |
| 3 | `OpenCodeCard` dedicado (custo/tokens, sem % de plano) | ✅ Implementado |
| 4 | Heatmap de atividade multi-agente (Claude+Codex+OpenCode) | ✅ Implementado |
| 5 | Bug de CSS do heatmap (desalinha/instável) | ✅ Hipótese forte corrigida, **não verificado ao vivo** |
| 6 | Pane OpenCode em branco com 2+ terminais | ⚠️ Investigado, causa **não confirmada**, nenhum fix aplicado |
| 7/8 | Tela cheia / três-pontinhos do Container | ✅ Bug real de tela cheia corrigido; três-pontinhos **não localizado com certeza** |
| 9 | Handy: pesquisa + reposicionar ditado por voz | ✅ Reposicionado + referenciado; normalização por IA **desenhada, não implementada** |
| 10 | Linha rosa divisória entre Containers | ⚠️ Investigado, **inconclusivo** |
| 11 | Harness E2E (worktree + graphify + OpenCode paralelo) | ✅ Implementado e **rodado de verdade** — ver §4 |
| 12 | Warnings de compilação (`ghostty_linked`) | ✅ Corrigido (4 warnings). 8 warnings de dead-code pré-existentes deixados de fora (ver §5) |

---

## 3. O que foi implementado, por área

### Detecção real de "working" do OpenCode (Incremento 1)
Causa raiz: `agentCompletionMonitor.ts` é uma heurística de PTY genérica (olha
output cru após Enter) que nunca funciona bem pro OpenCode porque ele abre uma
TUI de tela cheia com redraw constante.

- `src-tauri/src/opencode_bridge.rs` (novo): escreve um plugin real do
  OpenCode em `~/.config/opencode/plugin/alethe-bridge.js` — **global**, não
  por projeto. Formato confirmado na documentação oficial
  (`opencode.ai/docs/plugins/`). Reporta `session.idle`/`tool.execute.before`
  de volta pro Alethe via POST HTTP local.
- `agent_events.rs` ganha a rota `/opencode-status` no listener HTTP que já
  existia (mesmo usado pelos hooks HTTP do Claude Code).
- `XTermView/index.tsx` injeta `ALETHE_BRIDGE_ENDPOINT` no spawn de terminais
  opencode (reaproveita `agentHooksEndpoint()`).
- `activityTracker.ts` correlaciona por `cwd` (normalizado) e dá prioridade ao
  sinal do bridge sobre a heurística de PTY uma vez que ele chega pra aquele
  `ptyId` (não competem).
- **Fallback**: sem o plugin, cai de volta na heurística antiga — nada quebra.
- **Não testado ao vivo** (precisa abrir um terminal OpenCode de verdade no
  Alethe rodando e ver "tempo e foco" preencher).

### Custo/pricing do OpenCode (Incremento 2) — achado real, maior que o previsto
- **Bug real**: `opencode_db_path()` procurava `%APPDATA%\opencode\opencode.db`
  — esse arquivo **nunca existiu** nesta máquina. O banco real fica em
  `~/.local/share/opencode/opencode.db` (confirmado rodando `opencode db path`
  e inspecionando o schema de verdade com Python/sqlite3). Corrigido pra
  perguntar pro próprio binário primeiro (`opencode db path`), com fallback
  pro palpite antigo.
- A hipótese original do plano ("só lê a primeira linha do SQL, bug de
  multi-modelo") **era um mito** — `session.id` é `PRIMARY KEY` de verdade
  (confirmado), só existe 1 linha por sessão mesmo.
- **Achado melhor que o planejado**: `session.cost` já vem calculado pelo
  próprio OpenCode (schema real tem a coluna `cost REAL DEFAULT 0`, populada
  com pricing ao vivo — confirmei valores reais não-zero pra sessões pagas).
  Trocamos a tabela hardcoded de ~6 modelos por esse valor direto do banco —
  funciona pra qualquer modelo, não só os que eu conhecia.

### `OpenCodeCard` (Incremento 3)
Card na Home mostrando custo/tokens das últimas 24h (não %, já que BYOK não
tem quota de plano). `UsageStrip` agora tem 4 cards
(Claude/Codex/OpenCode/Atividade) — grid CSS ajustado.

### Heatmap multi-agente (Incremento 4)
`get_multi_agent_activity` soma Claude (mensagem por mensagem, já existia),
Codex (por ARQUIVO tocado — o campo de timestamp por linha do rollout do
Codex não está confirmado, contar por arquivo é uma aproximação honesta) e
OpenCode (mensagem por mensagem, via `message.time_created` no SQLite — schema
real tem tabela `message` com `time_created`/`time_updated` por mensagem,
11396 linhas confirmadas nesta máquina).

### Bug de CSS do heatmap (Incremento 5)
`.activityCol` tinha só `grid-template-rows`, sem `grid-template-columns` —
hipótese forte é que o auto-placement do CSS Grid preenchia os 7
`.activityCell` na horizontal (colunas implícitas) em vez de empilhar
verticalmente. Adicionado `grid-template-columns: 1fr` explícito. **Não
reproduzido/confirmado ao vivo** (sem app rodando nesta sessão).

### Pane OpenCode em branco com 2+ terminais (Incremento 6) — sem fix
Hipóteses descartadas por análise de código:
- Pool de contexto WebGL: **improvável**, OpenCode já usa `CanvasAddon`
  exclusivamente (nunca tenta WebGL).
- `fitAddon.fit()` com container em 0×0: **improvável**, já existe
  `ResizeObserver` + retries (0/120/320ms) genéricos que deveriam cobrir isso
  pra qualquer provider.
- Contenção entre 2 processos `opencode` no mesmo diretório: **hipótese mais
  forte restante**, mas não confirmada.

**Achado indiretamente relacionado durante o Incremento 11**: rodar 2
`opencode run` em paralelo **funcionou perfeitamente** via PowerShell Jobs
manuais (2 processos simultâneos, cada um escreveu seu próprio arquivo sem
erro). Isso enfraquece a hipótese de contenção CLI-a-CLI pra esse cenário
específico (`opencode run`, não-interativo) — mas o bug relatado é com
`opencode` interativo (TUI), que é um caminho de código diferente dentro do
CLI. Ainda inconclusivo pro caso real.

### Container: tela cheia (Incremento 7) — bug real corrigido
Componente real: `src/components/WorkspaceView/ProjectContainer.tsx` (contador,
`ChevronRight` colapsar, `Maximize2`/`Minimize2` tela cheia, `Minus` fechar —
bate com o screenshot "2 › ⤢ −").

**Bug real encontrado e corrigido**: em `WorkspaceView/index.tsx`, se
`fullscreenContainerId` aponta pra um container que não existe mais na vista
atual (removido, filtrado por grupo, etc.), o código não renderizava nada
especial **nem limpava o estado** — o app ficava com o botão de tela cheia
"preso" sem nunca voltar sozinho pra vista normal. Corrigido com um
`useEffect` que limpa o estado quando o alvo não resolve mais.

### Três-pontinhos (Incremento 8) — não localizado com certeza
`ProjectContainer.tsx` **não tem** nenhum botão de três-pontinhos — só os 3
botões acima. Candidatos investigados:
1. `MoreHorizontal` em `ProjectSidebar/index.tsx` (linha ~696, header do painel
   Explorer) — **confirmado sem `onClick` nenhum, genuinamente decorativo/morto**.
   Não corrigido: não sei o que esse menu deveria fazer (sem especificação),
   corrigir "às cegas" seria inventar uma feature nova.
2. O `openInspector`/`MoreHorizontal` que substituiu o toolbar antigo de
   `TerminalPane.tsx` no rewrite do PR #26 — **mudança de design intencional do
   upstream**, não bug (já documentado no commit `418d4ce` do PR #26).

### Linha rosa divisória (Incremento 10) — inconclusivo
Comparado `PaneArea.tsx`/`WorkspaceView.module.css` contra `origin/main` real
— nenhuma diferença de cor. `--border-strong` (usado no separator) não
resolve pra rosa/magenta em NENHUM dos 12 temas atuais (todos os valores são
grayscale-based). Não consegui identificar a origem. **Não investigado mais
fundo** por falta de acesso visual ao app rodando.

### Handy (Incremento 9)
Pesquisa real no README (`github.com/cjpais/Handy`): ele digita/cola direto na
janela focada (auto-type/paste via `xdotool`/`wtype`/`dotool`), **sem
API/hook/IPC documentado** pra interceptar o texto antes de chegar lá. Tem
flags de controle remoto (`--toggle-transcription`, `--toggle-post-process`,
`--cancel`) mas nenhum plugin/pós-processamento customizável documentado.

- Reposicionado: "Ditado por voz" saiu de Terminal e foi pra Integrations
  (onde Spotify/Discord já moram — mais coerente pra algo que é sobre integrar
  com ferramenta externa). Também ganhou entrada no índice de busca das
  Preferências (não tinha).
- Adicionada uma referência/hint ao Handy no card.
- **Normalização por IA — desenhada, não implementada**: como o Handy não
  expõe hook, a única forma limpa de "normalizar com IA por cima mantendo o
  Handy padrão" é interceptar do lado do Alethe, no próprio pipeline de paste
  do terminal (`writePtyChunked` em `XTermView/index.tsx` já faz bracketed
  paste chunking — dá pra detectar "colou um bloco grande de texto rápido"
  como sinal de que foi o Handy, mandar pra uma IA gratuita normalizar antes
  de encaminhar pro PTY). Pra "IA grátis", o próprio projeto já tem um
  precedente — o graphify usa Gemini free tier quando `GEMINI_API_KEY`/
  `GOOGLE_API_KEY` está setado. **Não implementei isso** porque mexe numa área
  sensível (pipeline de input do PTY, usada por TODOS os terminais, não só
  dictation) sem conseguir testar ao vivo — risco alto de quebrar paste normal
  pra economia de tempo questionável sem validação visual.

### Warnings de compilação (Incremento 12)
`Cargo.toml` ganhou `[lints.rust] unexpected_cfgs` declarando o cfg custom
`ghostty_linked` — resolve os 4 warnings que apareciam em
`lib.rs`/`ghostty_bridge.rs`. **Ambíguo o que mais o dono queria** ("todos os
warning" sem especificar se é Rust, console do webview, ou toasts de UI) — só
o de Rust foi endereçado, por ser o único já concretamente identificado nesta
sessão.

**8 warnings de dead-code restantes** (não mexidos, de propósito — parecem
scaffolding de feature futura, não quis deletar código que talvez ainda vá ser
usado sem confirmar):
- `WebRect` (x/y/width/height nunca lidos) — `src/lib.rs` área de webRect
- `TaskPriority::Idle`/`::Low` nunca construídos — `resource_manager.rs:57`
- `ScheduledTask.description` nunca lido — `resource_manager.rs:65`
- `ResourceState.running` nunca lido — `resource_manager.rs:96`
- `WebViewMemoryMode` nunca usado — `windows_webview.rs:21`
- `suspend()`/`resume()` nunca usados — `windows_webview.rs:63,76`
- 1 warning de build script (`unused import: std::path::PathBuf`)

---

## 4. Harness E2E (Incremento 11) — rodado de verdade, não só escrito

`src-tauri/src/worktrees.rs`, módulo `tests::opencode_e2e`, teste
`parallel_opencode_agents_respect_worktree_isolation_and_session_continuity`
(marcado `#[ignore]` — não roda no `cargo test` normal por depender de rede +
CLI externo + custo de tempo real).

**Rodar manualmente:**
```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib worktrees::tests::opencode_e2e -- --ignored --nocapture
```

O que faz: provisiona N worktrees reais (`worktree_provision`), escreve
graphify MCP em cada uma (`graphify_opencode_config_write`), dispara N
`opencode run` **de verdade em paralelo** (threads reais, não sequencial) com
um modelo `-free` sorteado de um pool pequeno de tarefas (pedido do dono:
verificação "mais aleatória"), confirma isolamento por CONTEÚDO (não por nome
de arquivo — todas as tarefas usam `resultado.txt` de propósito, pra provar
que isolamento é por diretório, não por coincidência de nome), retoma cada
sessão com `--session <id>` explícito (nunca `--continue`/`--pure` — ambos
descartados a pedido do dono depois que confirmei ao vivo que `--pure` esconde
ferramentas MCP, incluindo o graphify), e limpa tudo no final.

**Achados reais rodando de verdade** (não só teoria):
- `opencode run --format json` já devolve `sessionID` no PRÓPRIO stream de
  eventos — não precisa do snapshot-antes/depois de `opencode session list`
  que o plano original previa. Simplifica o design e elimina uma corrida.
- `--pure` **de fato** esconde ferramentas MCP (confirmado ao vivo com um
  probe real, e pelo próprio dono).
- Rodar 2 `opencode run` em paralelo funciona sem contenção nenhuma (testado
  via PowerShell Jobs manuais — 2 processos simultâneos, cada um escreveu seu
  próprio arquivo corretamente).
- Um bug real do MEU PRÓPRIO teste (não do Alethe) foi pego rodando de
  verdade: a checagem de isolamento original comparava por NOME de arquivo,
  mas as 3 tarefas do pool usam o mesmo nome (`resultado.txt`) de propósito —
  cada worktree ter seu próprio `resultado.txt` é esperado, não vazamento.
  Corrigido pra comparar por CONTEÚDO.
- **Última rodada (com a correção acima) ficou rodando mais de 5 minutos e foi
  movida pra background — resultado final não confirmado nesta sessão.** Se
  isso ainda estiver rodando/travado quando você voltar, checar
  `cargo test ... -- --ignored --nocapture` de novo; se travar consistentemente
  em >5min (vs. os ~45s das rodadas anteriores), pode ser: rate-limit do
  modelo free depois de várias chamadas na mesma sessão, ou uma trava real
  worktree-a-worktree que só aparece com o `graphify_opencode_config_write`
  chamado em ambas ANTES do `opencode run` (diferença real vs. o teste manual
  que não tinha graphify configurado).

---

## 5. Estrutura do projeto (referência rápida)

```
src-tauri/src/
  agent_cost.rs         — custo/tokens por sessão (Claude JSONL, Codex JSONL, OpenCode SQLite)
  agent_events.rs       — listener HTTP local (hooks Claude Code + bridge OpenCode)
  opencode_bridge.rs     — NOVO: plugin global do OpenCode (sinal working/idle real)
  claude_sessions.rs    — sessões Claude + get_multi_agent_activity (heatmap)
  codex_sessions.rs     — sessões Codex
  opencode_sessions.rs  — sessões OpenCode (stub, invoca `opencode session list` via subprocess)
  worktrees.rs          — RFC-003, provision/list/remove/lock, + harness E2E (§4)
  graphify.rs           — MCP do graphify pros 3 providers (Claude/Codex/OpenCode)
  git_control.rs        — locks admin vs transitórios, retry/backoff
  conflict_resolution.rs / merge_analyzer.rs — ciclo de merge seguro
  projects.rs           — save_projects com guarda de monotonicidade

src/
  lib/agentCompletionMonitor.ts — heurística de PTY (fallback quando bridge não tá disponível)
  lib/activityTracker.ts        — correlaciona bridge/heurística por ptyId
  lib/costFormat.ts             — fmtUsd/fmtTokens compartilhados
  lib/activityCache.ts          — cache do heatmap (renomeado de claudeActivityCache.ts)
  components/HomeView/UsageStrip.tsx — ClaudeCard/CodexCard/OpenCodeCard/ActivityGraph
  components/WorkspaceView/ProjectContainer.tsx — Container real (tela cheia, colapsar, fechar)
  stores/mergeStore.ts — máquina de estados do ciclo de merge
```

## 6. Verificação rodada nesta sessão

- `cargo check` / `cargo test --lib` (sem os ignored): **verde** a cada
  incremento, commitado incrementalmente (ver `git log` da branch).
- `npx tsc --noEmit`: **verde**.
- `npm test` (vitest): **verde** (27/27).
- `npx vite build`: verificar antes de considerar tudo pronto — **não rodei
  de novo depois do último incremento**, rodar antes de confiar 100%.
- O harness E2E (§4) foi rodado de verdade 2x (achou e corrigiu 1 bug real no
  próprio teste); a 3ª rodada (com a correção) não terminou dentro desta
  sessão.

## 7. Próximos passos recomendados (em ordem de valor)

1. Confirmar se o harness E2E (§4) termina com sucesso rodando de novo — se
   travar, investigar se é rate-limit ou uma trava real.
2. Abrir o Alethe de verdade (`npm run app`) e validar visualmente os itens
   marcados "não verificado ao vivo": heatmap, OpenCodeCard, tela cheia do
   Container, transição de tema.
3. Decidir o que fazer com o `MoreHorizontal` morto em `ProjectSidebar.tsx`
   (linha ~696) — remover, ou dar uma função real (que menu deveria abrir?).
4. Decidir se vale investir na normalização por IA do ditado (design em §3,
   "Handy") — é a peça mais arriscada/maior das que ficaram de fora.
5. Investigar a linha rosa (Lacuna 10) e o pane OpenCode em branco (Lacuna 6)
   com o app rodando ao vivo — impossível avançar mais sem isso.
