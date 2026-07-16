#!/bin/sh
set -eu

REQUIRED_NODE_MAJOR=25

if [ -f .nvmrc ]; then
	NVM_DIR=${NVM_DIR:-"$HOME/.nvm"}
	if [ -s "$NVM_DIR/nvm.sh" ]; then
		# .nvmrc の指定バージョンへ自動で切り替える
		. "$NVM_DIR/nvm.sh"
		echo "Node.js バージョンを .nvmrc に合わせます (nvm use)。"
		if ! nvm use >/dev/null; then
			echo "nvm use に失敗しました。必要に応じて 'nvm install' を実行してください。"
			exit 1
		fi
	fi
fi

if ! command -v node >/dev/null 2>&1; then
	echo "node が見つかりません。nvm を読み込み後に 'nvm use' を実行してください。"
	exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
	echo "npm が見つかりません。nvm を読み込み後に 'nvm use' を実行してください。"
	exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "${NODE_MAJOR}" != "${REQUIRED_NODE_MAJOR}" ]; then
	echo "Node.js v${REQUIRED_NODE_MAJOR} が必要です。'nvm use' で切り替えてください。"
	echo "現在の Node.js: v$(node -v)"
	exit 1
fi

if [ ! -d node_modules ]; then
	echo "依存パッケージをインストールします (npm ci)。"
	npm ci
fi

echo "ローカル環境で TypeScript をビルドします。"
npm run build
