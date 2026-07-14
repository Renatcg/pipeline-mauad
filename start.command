#!/bin/zsh
cd "$(dirname "$0")"

export PORT="${PORT:-4174}"

if command -v node >/dev/null 2>&1; then
  exec node server.js
fi

RUNTIME_NODE="/Users/renatocguimaraes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ -x "$RUNTIME_NODE" ]; then
  exec "$RUNTIME_NODE" server.js
fi

echo "Node.js não encontrado."
exit 1
