# Claude-free Menubar App

Um wrapper desktop premium para o CLI `claude-free`.

## Funcionalidades
- **Acesso Rápido**: Clique no ícone da Menu Bar ou use `Cmd+Shift+C`.
- **Inteligência Isolada**: Executa via `claude-free` (Step 3.5 Flash) no seu diretório `Developer`.
- **Streaming Real-time**: Respostas fluem instantaneamente via JSON stream.
- **Design Apple Dark**: Interface minimalista e focada em escrita.

## Como Rodar
1. Entre na pasta: `cd ~/Developer/claude-free-menubar`
2. Instale (se necessário): `npm install`
3. Inicie: `npm run dev`

## Estrutura
- `electron/main.ts`: Controle da janela e tray.
- `electron/claudeRunner.ts`: Execução segura do processo via `zsh -lic`.
- `src/App.tsx`: UI em React com Framer Motion.
