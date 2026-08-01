# Changelog

Mudanças relevantes do **Alethe** para quem usa o app. Formato inspirado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/); versionamento semântico
([SemVer](https://semver.org/lang/pt-BR/)). Datas em UTC.

> **Regra:** toda adição, alteração ou remoção de feature entra aqui, sob
> `[Não lançado]`, na mesma tarefa. Ao releasar, `[Não lançado]` vira a nova
> versão com data e um novo `[Não lançado]` vazio é aberto no topo.

## [Não lançado]

### Adicionado

- Padrões de código documentados (`docs/CODE_STANDARDS.md`) e tooling de lint/format: referência única de estilo, estrutura de componentes, TypeScript, IPC, reuso de helpers, uso de `useEffect`/Zustand, i18n e checklist de PR, mais os comandos `npm run lint`/`npm run format` (ESLint flat + Prettier).
- Tela **"Sobre & Atualizações"** em Configurações: mostra a versão instalada do app, verifica atualizações sob demanda e instala a nova versão com barra de progresso e erros visíveis (em vez de a falha sumir sem aviso).
- A **versão instalada** agora aparece sempre no rodapé da sidebar; clicar abre a tela "Sobre & Atualizações".

### Corrigido

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

[Não lançado]: https://github.com/Kc1t/alethe-agents/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/Kc1t/alethe-agents/releases/tag/v1.3.0
