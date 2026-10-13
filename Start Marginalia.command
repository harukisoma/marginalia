#!/bin/zsh -l
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null; then
  echo "Node.js 22以上をインストールしてから開いてください。"
  read -r "reply?Enterで終了"
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci || exit 1
fi
npm run build || exit 1
if curl -fsS http://127.0.0.1:4318/ >/dev/null 2>&1; then
  open http://127.0.0.1:4318/
  exit 0
fi
npm run companion &
marginalia_companion_pid=$!
trap 'kill "$marginalia_companion_pid" 2>/dev/null' EXIT INT TERM
for marginalia_attempt in {1..40}; do
  if curl -fsS http://127.0.0.1:4318/ >/dev/null 2>&1; then
    open http://127.0.0.1:4318/
    break
  fi
  sleep 0.25
done
wait "$marginalia_companion_pid"
