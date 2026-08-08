# Changelog

Mudanças relevantes do **Alethe** para quem usa o app. Formato inspirado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/); versionamento semântico
([SemVer](https://semver.org/lang/pt-BR/)). Datas em UTC.

> **Regra:** toda adição, alteração ou remoção de feature entra aqui, sob
> `[Não lançado]`, na mesma tarefa. Ao releasar, `[Não lançado]` vira a nova
> versão com data e um novo `[Não lançado]` vazio é aberto no topo.

## [Não lançado]

- Fixed profile switching without restarting the app and refreshed terminal chats correctly when resuming parked sessions.
- Refined the Accounts modal layout with clearer hierarchy, spacing, and profile creation controls.
- Replaced the Todo project selector with a viewport-safe dropdown that keeps long project paths contained during use and recording.
- Added an independent native desktop icon theme preference, defaulting to Dark and supporting all Alethe themes plus the Blue/Pink Gradient variants.
- Prevented concurrent terminals from resuming the same Codex conversation, avoiding the active-writer crash during session restore.
- Made the Codex active-writer recovery robust to bootstrap errors split across multiple PTY output chunks.
- Set the generated desktop and installer icons to the Dark Alethe icon by default.
- Updated the root README branding to use the Dark Alethe app icon.
- Standardized all project dropdowns on the Todo List's portal-based behavior, with viewport-safe positioning, truncation, keyboard escape handling, and consistent styling.

### Added

- **LAN remote control:** open an authenticated mobile web view from the Alethe menu, browse existing agent chats across groups, watch terminal output live, and send one message at a time without changing the workspace.
- **LAN remote control controls:** the feature can now be turned off, immediately disconnects paired devices, shows the active connection count, and supports regenerating the pairing token from a clearer status modal.
- Agent Sandbox Codex workers now use a persistent app-server conversation: streamed replies appear in the terminal pane and follow-up messages continue the same thread instead of starting a disconnected one-shot process.
- Codex app-server panes now identify their transport and become the selected message destination when clicked, reducing accidental follow-up messages sent to the Planner.
- Agent Sandbox sessions now survive workspace tab changes, preserving live terminals, worker status, groups, and app-server threads until the session is explicitly stopped or its project changes.
- Sandbox planners now avoid executing a worker's delegated follow-up themselves when a worker is already available, keeping responsibility in the selected worker terminal.
- Agent Sandbox now relays completed Codex app-server replies back into the parent Claude Planner terminal, preserving a real bilateral delegation loop.
- Agent Sandbox Codex protocol workers now render their streamed output in a clean terminal surface instead of injecting protocol chunks into a PowerShell shell.
- Agent Sandbox orchestration workers now start in YOLO mode by default: Claude uses `--dangerously-skip-permissions` and Codex uses unrestricted, non-interactive approvals.
- **Project sidebar drag state:** drop targets now appear only while DnD-kit has an active drag, preventing stale “move into this group” and “ungrouped” prompts after a drag ends.
- **Top bar spacing:** controls, tabs, status pills, and window actions now follow a consistent spacing, height, and radius system in both top bar layouts.
- **Top bar customization control:** the edit button no longer reserves empty space when hidden, while remaining available on hover and keyboard focus.
- **Loading screen:** startup now uses the same Home ASCII treatment and background artwork, with a quieter console-style status panel.
- **LAN remote security hardening:** remote WebSocket clients now authenticate before counting toward a four-device limit, listeners bind to the selected LAN address, remote messages strip control characters, and responses include restrictive security headers.
- **Remote Control settings:** the modal now persists a configurable authenticated-device limit, defaults it to one device, and shows connected devices against the active limit.
- **Consistent form controls:** dropdowns now use a compact 32px system-wide standard instead of inconsistent oversized modal and sidebar variants.
- **Remote Control settings page:** security policy, session lifetime, LAN status, and individual device revocation now live in a dedicated Preferences category; the QR modal is focused on quick access.
- **Remote device sessions:** connected devices now have names, connection metadata, a one-hour default expiry, and individual revocation support.
- **Remote address privacy:** the UI keeps the active LAN address behind a generic placeholder until a device completes QR pairing; the QR payload remains functional.
- Agent Sandbox projects can be created with a name and project folder, persist in the project sidebar, and open directly in the real multi-agent terminal workspace.
- Project folder control now keeps the icon, path and browse action aligned in one consistent field.
- Dev builds now use a separate Tauri identifier, while project terminals can be mirrored into the Agent Sandbox and grouped with Shift selection.
- Agent Sandbox now starts only the planner; worker terminals are created on demand and remain visible for long-running tasks such as development servers.
- Sandbox spawn bridge can now create a regular shell terminal, making long-running development servers visible without wrapping them in an agent.
- Planner spawn instructions now use compact payloads so longer delegation prompts do not exceed the Windows terminal command parser limit.
- Spawned agent tasks now use the terminal's readiness-aware initial input flow, preventing the first delegated prompt from being lost during CLI startup.
- Sandbox planner and Claude workers now default to the lower-cost Haiku model, and delegated tasks are sent after the spawned PTY has finished booting.
- Agent Sandbox restores the selected Sandbox project on app startup instead of showing an empty state when the active project has not loaded yet.
- Agent Sandbox now automatically starts the selected project after reload and keeps its regular project terminals synchronized after the planner boots.
- Switching between Sandbox projects now moves the live session to the newly selected project's working directory instead of keeping the previous project's agents.
- Sandbox runs now invalidate in-flight spawns when stopped or switched, preventing orphan PTYs from surviving a project change.
- Sandbox startup failures no longer permanently disable the project; the automatic start guard is released so the session can be retried.
- Sandbox spawn requests now compare Windows working directories case-insensitively, so a path with different casing or trailing separators is not discarded.
- Spawned Codex panes now show a working state while their delegated task is being submitted, with a safe Enter retry for TUI startup timing.
- Delegated sandbox prompts now use the same delayed bracketed-paste and separate-submit flow as regular terminal prompts, so Codex and Claude actually start the received task after boot.
- Initial prompts now have a timed fallback while a CLI is still producing bootstrap or MCP output, with a separate Enter retry so a busy Codex TUI cannot leave the task stuck at its first prompt.
- Codex and Claude workers with delegated tasks now start from their supported prompt arguments (`codex exec` and Claude print mode), keeping the real terminal visible without depending on fragile TUI keystroke injection.
- Automated Codex workers now skip the repository trust check for the explicitly selected Sandbox directory, and Sandbox spawn/PTY failures emit structured diagnostic logs without exposing the task text.
- Automated workers now switch from Working to Done or Error based on their streamed completion/error output, even when the surrounding shell PTY remains open.
- Sandbox prompts are cleared after successful submission, preventing HMR or pane remounts from executing the same delegated task twice.
- Sandbox task delivery now waits for PTY output to settle, with a deadline fallback, and preserves each terminal's own working directory.
- Codex resume now refuses session IDs already claimed by another live Alethe pane, avoiding active-writer bootstrap conflicts after reloads.
- Codex active-writer errors are now detected from PTY output and automatically recover by opening a fresh session instead of leaving the chat stuck.

### Alterado

- **Ferramentas de desenvolvimento no menu hambúrguer:** Welcome, Theme Picker e Redo Onboarding agora aparecem somente em sessões de desenvolvimento.

### Alterado

- **Avatar padrão de novos usuários:** o perfil agora usa a nova ilustração roxa padrão quando nenhuma imagem personalizada é definida, inclusive na prévia do onboarding.
- **Todo List com mais feedback visual:** tarefas agora têm animações de entrada, hover, arraste e destaque claro do destino durante a reorganização.

### Alterado

- **Comentários no visualizador Markdown desativados temporariamente:** removidos o popover de notas, o painel de comentários e o atalho relacionado enquanto o recurso é corrigido.
- **Workspace vazio e arraste da sidebar:** o caminho padrão do projeto é preenchido automaticamente, o botão desabilitado mantém contraste legível e projetos arrastados agora acompanham o cursor com uma prévia visual.
- **Sidebar com mais feedback visual:** abertura, troca de conteúdo, hover e arraste agora têm transições suaves, além de destaque mais claro para o destino do drop.

- **Agent Sandbox experimental:** canvas temporário com agentes de demonstração apoiados por PTYs reais, cartões arrastáveis e conexões animadas para troca de mensagens estruturadas.
- **Agent Sandbox em tela cheia:** canvas, controles e preview de terminal agora usam uma composição compacta e flutuante, alinhada ao design system.
- **Terminais reais no Agent Sandbox:** cada agente agora é renderizado diretamente como um terminal Alethe dentro do canvas, usando a mesma área de conteúdo dos terminais normais.
- **Layout do Agent Sandbox:** corrigida a largura colapsada que quebrava o título, escondia os agentes e cortava os controles no painel central.
- **Panes do Agent Sandbox:** blocos agora usam o mesmo header, dimensões, fundo e área xterm dos terminais reais do workspace, sem card ou preview artificial.
- **Resize e providers no Agent Sandbox:** panes podem ser redimensionados pelo canto e a demo abre Lead/QA com Claude Code, Backend com OpenCode e Frontend como shell real.
- **Focus no Agent Sandbox:** novo modo organiza os terminais em uma grade preenchida dentro da área central, com transição animada e retorno ao layout anterior.
- **POC real de comunicação entre agentes:** removida a sequência mockada; o Sandbox agora abre dois Claude Code independentes e envia mensagens reais para o PTY do agente destinatário.
- **Relay do Agent Sandbox:** mensagens agora identificam o agente remetente pelo nome completo do pane, como `Lead Claude`, em vez do ID interno.
- **Planner-to-worker real:** o Sandbox agora inicia Claude Code com Sonnet como planner e Codex como worker, aceita spawns reais pelo evento local `/spawn` e adiciona o novo terminal à sessão.

## [1.4.1] — 2026-08-07

### Corrigido

- **Notas de versão incorretas no modal "Novidades" e na release do GitHub.** O texto vinha de uma cópia solta e desatualizada de `CHANGELOG.md` fora deste repositório; passou a refletir este arquivo, a fonte real.

## [1.4.0] — 2026-08-07

Graphify vira recurso opcional, o comando `alethe` abre projetos direto do
terminal, e uma leva grande de correções de estabilidade e segurança —
listener HTTP do AgentCanvas, colar imagem nos agentes, retomada de sessão
respeitando memória, e paridade Linux/macOS pro Antigravity e OpenCode.

### Adicionado

- **Graphify como recurso opcional:** a visualização do grafo agora pode ser ativada ou desativada em Preferências, sem alterar a configuração MCP dos agentes.
- **Abrir projeto pelo terminal:** o comando `alethe` abre a pasta atual como projeto no Alethe — `alethe`, `alethe .` ou `alethe ~/algum/projeto`. Se a pasta já for um projeto, ele só é trazido pro workspace (sem duplicar); se não for, o projeto é criado com um terminal já apontando pra ela. Com o app aberto, a janela existente é focada em vez de subir uma segunda instância. Instale o comando em **Configurações ▸ Integrações ▸ Comando de terminal**.
- Padrões de código documentados (`docs/CODE_STANDARDS.md`) e tooling de lint/format: referência única de estilo, estrutura de componentes, TypeScript, IPC, reuso de helpers, uso de `useEffect`/Zustand, i18n e checklist de PR, mais os comandos `npm run lint`/`npm run format` (ESLint flat + Prettier).
- **Abrir arquivos no File Explorer:** clique duas vezes em qualquer arquivo na aba "File Explorer" da sidebar para abri-lo como pane no workspace.
- **Visualizar diffs no Git Control:** clique duas vezes em um arquivo na seção "Changes" ou "Staged" do Git Control para abrir um diff pane monoespaçado no workspace com as alterações.
- Tela **"Sobre & Atualizações"** em Configurações: mostra a versão instalada do app, verifica atualizações sob demanda e instala a nova versão com barra de progresso e erros visíveis (em vez de a falha sumir sem aviso).
- A **versão instalada** agora aparece sempre no rodapé da sidebar; clicar abre a tela "Sobre & Atualizações".

### Alterado

- **Tema do terminal** saiu da aba Terminal e agora fica em Preferências ▸ Appearance, ao lado do tema da interface.

### Corrigido

- **Segurança — listener HTTP interno:** o endpoint local do AgentCanvas (`localhost:9123`) agora exige um token secreto gerado a cada inicialização do app (`X-Alethe-Token`). Requisições sem o token correto recebem 401 e são descartadas, impedindo que qualquer processo local injete tarefas ou spawne agentes sem autorização. O token é incluído automaticamente nos hooks do Claude Code via `agent_hooks_settings_path`.
- **Segurança — DoS por body ilimitado:** a leitura do corpo HTTP agora é limitada a 1 MB (`take(BODY_LIMIT)`), impedindo que um payload gigante cause OOM no processo do Alethe.
- **Controles da topbar ao fechar sidebars**: o espaço reservado agora permanece apenas na barra superior para os botões de controle; as sidebars fechadas não ocupam nenhuma largura no conteúdo principal.

- **Loop infinito ao montar a área de panes**: o selector Zustand do `PaneArea` agora usa um fallback estável quando o projeto ainda está sendo hidratado, evitando o aviso `getSnapshot should be cached` e o React #185.

- **Erro React #185 em terminais xterm.js**: o renderer WebGL instável no WebView Windows foi desativado; os terminais agora usam o renderer DOM, evitando a corrida de teardown que deixava `Viewport.syncScrollArea` sem dimensões.

- **Loop de atualização ao redimensionar sidebars**: alterar a largura salva não força mais o painel redimensionável a reconstruir seu `defaultSize` durante o próprio evento de resize, evitando o erro React #185 (Maximum update depth exceeded).

- **Colar imagem no terminal** (Ctrl+V ou atalho do agente) voltou a funcionar com OpenCode, Claude Code e Codex: screenshots (`Win+Shift+S`), imagens copiadas da web e arquivos de imagem copiados no Explorer agora são detectados no clipboard e colados como caminho de arquivo no PTY — antes, qualquer clipboard sem texto puro era descartado silenciosamente.
- **Detecção do CLI do Antigravity no Linux/macOS**: o pré-check que decide se mostra "comando não encontrado" comparava o nome cru do agente (`antigravity`) em vez do binário real (`agy`). No Windows um remap interno mascarava o problema; no Linux/macOS o agente aparecia como não instalado mesmo com o `agy` presente no PATH.
- **Processos órfãos ao fechar/reiniciar terminais no Linux/macOS**: a árvore de processos do agente (node/claude/codex e workers) só era derrubada por completo no Windows (`taskkill /F /T`); no Unix, a rotina de encerramento existia mas nunca era chamada, deixando descendentes vazando RAM a cada close/restart. Agora o encerramento por árvore roda em todas as plataformas.
- **Comparação de cwd inconsistente entre 3 lugares do código** (rastreamento de atividade, retomada de sessão, canvas de agentes): uma das implementações forçava minúsculas e `\` mesmo em paths Linux/macOS (case-sensitive), o que podia confundir duas pastas com nomes diferentes só na caixa. Unificado numa única função que só normaliza separador/caixa quando o path é claramente do Windows.
- **Atalhos de teclado exibidos com convenção errada por plataforma**: a Home sempre mostrava glifos de Mac (⌘T, ⌘⇧P) mesmo no Windows/Linux, e a barra lateral sempre mostrava "Ctrl+..." mesmo no macOS. Agora os dois usam a mesma detecção de plataforma já existente para escolher o formato certo.
- **OpenCode não retomava a sessão certa ao reabrir o app**: o ID de sessão do OpenCode nunca era salvo no fluxo normal de spawn (ao contrário de Claude/Codex/Antigravity), então cada pane sempre nascia sem contexto — ou, se caísse no fallback `--continue`, arriscava pegar a conversa mais recente de OUTRO pane no mesmo diretório. Agora cada terminal reivindica e persiste sua própria conversa (ID salvo → conversa existente não reivindicada → nova conversa detectada após o spawn) e reabre sempre com `--session <id>` correto.
- **Sessões do Antigravity ordenadas de forma arbitrária**: todas as conversas recebiam o mesmo timestamp (o do arquivo de cache inteiro), então "a mais recente" não era real — agora usa o horário de cada conversa individual.
- **Match de pasta do Antigravity podia confundir projetos com nomes parecidos** (ex.: `Project` e `Project2`) por comparar prefixo de string sem checar a fronteira do separador de caminho.
- **Comparação de cwd do OpenCode no Linux/macOS**: o backend forçava minúsculas incondicionalmente (só o Windows é case-insensitive), podendo confundir diretórios como `/home/u/Project` e `/home/u/project`.
- **Texto desalinhado nos terminais** (mais visível no TUI do OpenCode, com emojis/símbolos na status bar): o xterm.js usava a tabela de largura Unicode antiga por padrão, calculando uma largura diferente da que os próprios CLIs assumem pra emojis e símbolos — desalinhava a linha inteira de forma permanente (nenhuma tecla ou redimensionamento corrigia). O addon `@xterm/addon-unicode11` já era uma dependência instalada mas nunca tinha sido ativado.
- **"Retomar última sessão" podia reiniciar dezenas de agentes de uma vez sem nenhuma checagem de RAM**: a rotina reiniciava todo painel de agente vivo em qualquer projeto/grupo do workspace (não só o visível na tela) chamando o PTY diretamente, ignorando a fila de spawn e o supervisor de memória que protegem a abertura normal de terminais. Agora cada restart passa pela mesma fila (respeita o teto de concorrência e a pausa por pressão de memória), e o botão pede confirmação mostrando quantos painéis serão reiniciados quando forem mais de um.
- **Card de uso do Antigravity no modal "Detalhes de uso de IA" estava implementado mas nunca aparecia**: o componente (cotas por bucket, % usado, tempo pra resetar, igual ao card do Claude Code) já existia por completo, só faltava desativar o gráfico de atividade no lugar dele dentro do modal. Agora aparece normalmente.
- **Status do Antigravity sempre mostrava "sem login no agy" mesmo com o `agy` autenticado**: a busca da credencial no Windows Credential Manager tinha dois bugs — o alvo era montado como `"{usuário}.{serviço}"` pelo crate de keyring em vez do alvo real `gemini:antigravity` que o `agy` usa, e a leitura assumia blob UTF-16LE quando o `agy` (binário Go) grava UTF-8 puro. Corrigido para buscar pelo alvo exato e decodificar como UTF-8 — agora o card mostra as cotas reais.

## [1.3.0] — 2026-07-27

Integra as contribuições de multi-provider/graphify e de macOS, além do redesign
da Home, da tela de carregamento e da sidebar, e o suporte ao Antigravity.

### Adicionado

- **Graphify multi-provider (grafo de código como MCP).** Novo painel de
  visualização do grafo por projeto (abre pelo menu ⋯ na sidebar) e a opção
  "Graphify MCP" no editar-projeto. Com ela ligada, o grafo é entregue como
  servidor MCP para os agentes dos **três** CLIs — Claude via `--mcp-config`,
  Codex e OpenCode via merge não-destrutivo no config do próprio projeto
  (`.codex/config.toml` / `opencode.json`). Inclui snapshots do grafo.
- **Terminal nativo Ghostty (macOS).** Backend de terminal via libghostty
  embutido numa NSView sobre a WebView, opt-in nas Preferências. Sem efeito em
  Windows/Linux (segue no xterm.js).
- **Cantos arredondados da janela no macOS**, recortados no nível do AppKit para
  casar com a janela sem decoração nativa. No-op fora do macOS.
- **Suporte ao provider Antigravity (`agy`).** Detecção do CLI, spawn/resume por
  `--conversation`, descoberta de sessões e widget de uso próprio.
- **Controle experimental de opacidade da janela**, para enxergar o desktop
  através do Alethe.

### Alterado

- **Robustez do ciclo de merge/worktrees.** Escrita monotônica de `projects.json`
  (mutex de sequência + instância única do app), classificação de locks do git
  (administrativo vs. `index.lock` transitório com backoff), rastreamento e
  limpeza em lote de worktrees órfãs, e máquina de estados do merge com
  auto-finalização.
- **Descoberta do token do Claude no macOS** via Keychain (backends de keyring
  declarados por plataforma) e correção do vi-mode indesejado no terminal em dev
  (o `EDITOR=vi` que o `npm run` injetava não vaza mais para os shells).
- **Home redesenhada.** Arte de fundo com efeito ASCII interativo e transição
  suave para a dashboard; lançador rápido em formato de mini-terminal com toolbar
  de agente/projeto/pasta/modo; player do Spotify em dock discreto; painéis de
  Usage & Activity e Time & Focus com composição e filtros mais claros; streak e
  atividade reais; digitar no mini-terminal não rerenderiza mais os gráficos.
- **Tela de carregamento refeita:** marca da Alethe em efeito ASCII animado, com
  o nome, uma linha de console "Inicializando workspace" e uma trilha dot-matrix
  de progresso.
- **Sidebar de Projects reorganizada:** projeto ativo como card fixo no topo com
  transição suave de expandir/recolher, lista plana dos demais, ícone de
  monograma colorido, menu ⋯ sempre visível (sem recorte), indicador de trabalho
  (dot-matrix) à esquerda e etiqueta "foco"; sem branch, contagem, caminho da
  pasta nem cabeçalho de seção sem-grupo.
- **Terminal:** links deixam o texto explicativo fora da área clicável; falhas de
  digitação recuperam o PTY sozinhas; reiniciar um Codex preserva e retoma a
  conversa; e o foco de entrada é recuperado após montagem/interação/perda de
  contexto gráfico.
- O **modo irrestrito** virou um controle destacado, acionável com um clique no
  modal de adicionar IA.
- O **gerenciamento de memória** passou a apenas monitorar por padrão; o LRU
  inteligente exige ativação explícita nas Preferências.
- O **modal de novo terminal** ganhou seleção em cards, pasta destacada e atalhos
  de pastas recentes.
- A **retomada automática** descarta IDs órfãos de conversas (Claude, Codex,
  Antigravity) antes de iniciar o terminal.

### Corrigido

- **Config do Codex corrompido no Windows:** o `command`/path agora é escapado
  para string TOML em `graphify_codex_config_write` — um caminho com contrabarras
  (`C:\...`) não quebra mais o `.codex/config.toml` inteiro.
- **Loop infinito no merge:** o poll de fallback do `finalize` silencioso agora
  encerra o watch ao cair em estado de falha, em vez de re-disparar a cada 7s.

### Removido

- Rótulo de seção "Solto/Ungrouped" acima dos projetos sem grupo na sidebar.
- Aviso textual de terminal estacionado no overlay (a ação de retomar continua).

[Não lançado]: https://github.com/Kc1t/alethe-agents/compare/v1.4.1...HEAD
[1.4.1]: https://github.com/Kc1t/alethe-agents/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/Kc1t/alethe-agents/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Kc1t/alethe-agents/releases/tag/v1.3.0
