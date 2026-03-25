#!/bin/bash
# Claude-free Launcher Script (Corrigido para macOS Homebrew)
# Autor: Antigravity

# Forçar o PATH para incluir o Homebrew e os binários padrão do Mac
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

PROJECT_DIR="/Users/lucasjonasfernandes/Developer/claude-free-menubar"

echo "🚀 Iniciando Claude-free Menubar em background..."

cd "$PROJECT_DIR" || exit

# Executa o dev server em background
# Usamos o caminho absoluto do npm para garantir compatibilidade
/opt/homebrew/bin/npm run dev > /tmp/claude-free-launch.log 2>&1 &

echo "✅ App lançado com sucesso."
echo "Logs em: tail -f /tmp/claude-free-launch.log"
