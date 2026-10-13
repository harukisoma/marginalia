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
open http://127.0.0.1:4318/
npm run companion
