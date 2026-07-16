Node.js バージョン切り替え（Node 25）：
    nvm install 25
    nvm use

依存パッケージのインストール：
    npm ci

ビルド方法：
    npm run build

テスト実行：
    npm run test

Dockerイメージの作成方法：
    npm run image

Dockerコンポーズ停止：
    (cd docker; ./down.sh)

Dockerコンポーズ起動（停止・ビルド・イメージ作成・デプロイ）：
    npm run start

