# Changelog

Mudanças relevantes do **Alethe** para quem usa o app. Formato inspirado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/); versionamento semântico
([SemVer](https://semver.org/lang/pt-BR/)). Datas em UTC.

> **Regra:** toda adição, alteração ou remoção de feature entra aqui, sob
> `[Não lançado]`, na mesma tarefa. Ao releasar, `[Não lançado]` vira a nova
> versão com data e um novo `[Não lançado]` vazio é aberto no topo.

## [Não lançado]

### Adicionado

- **Abrir arquivos no File Explorer:** clique duas vezes em qualquer arquivo na aba "File Explorer" da sidebar para abri-lo como pane no workspace.
- **Visualizar diffs no Git Control:** clique duas vezes em um arquivo na seção "Changes" ou "Staged" do Git Control para abrir um diff pane monoespaçado no workspace com as alterações.
- Tela **"Sobre & Atualizações"** em Configurações: mostra a versão instalada do app, verifica atualizações sob demanda e instala a nova versão com barra de progresso e erros visíveis (em vez de a falha sumir sem aviso).
- A **versão instalada** agora aparece sempre no rodapé da sidebar; clicar abre a tela "Sobre & Atualizações".

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
