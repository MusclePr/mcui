#!/bin/bash

#==========================================================================
# マインクラフトのサーバーを初期化するためのスクリプト
#==========================================================================

# docker-compose のインストール確認と後片付けを兼用
docker compose down
if [ $? -ne 0 ]; then
    echo "docker compose is not installed. Please install docker compose."
    echo "https://docs.docker.com/compose/install/"
    exit 1
fi

function clean()
{
    # Velocity/Paper の初期化
    echo "Cleaning up ..."
    rm -rf lobby server-1 proxy
    echo "done."
}

if [ "${1}" = "clean" ]; then
    clean
    exit 0
elif [ "${1}" = "setup" ]; then
    echo "Setting up ..."
else
    echo "Usage: $(basename ${0}) [clean|setup]"
    echo "  clean ... remove all data"
    echo "  setup ... setup config files"
    exit 0
fi

# yq のインストール確認
yq --version > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "yq is not installed. Please install yq."
    echo "https://github.com/mikefarah/yq/"
    exit 1
fi

# openssl のインストール確認
openssl version > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "openssl is not installed. Please install openssl."
    exit 1
fi

ORIGINAL_DEFAULT_CONFIG_URL="https://github.com/PaperMC/Velocity/raw/refs/heads/dev/3.0.0/proxy/src/main/resources/default-velocity.toml"

# 最新のオリジナルの設定ファイルを元に、config/velocity.toml を更新する
function create_proxy_config()
{
    local -r CONFIG="proxy/config/velocity.toml"

    # デフォルト設定からコピーを作成
    mkdir -p proxy/config
    curl -sLo "${CONFIG}" "${ORIGINAL_DEFAULT_CONFIG_URL}"

    # player-info-forwarding-mode を "modern" に変更
    sed -i -E 's/^(player-info-forwarding-mode\s*=\s*).*$/\1"modern"/' "${CONFIG}"

    # いらないサーバーの削除
    sed -i -E '/^(factions|minigames)\s*=/d' "${CONFIG}"
    sed -i -E '/^"(factions|minigames)\.example\.com"/,/\]/d' "${CONFIG}"

    # [servers] セクションの変更
    sed -i -E 's/^lobby =.*/lobby = "mc-lobby"\nserver-1 = "mc-server-1"/' "${CONFIG}"
}

function getDockerStatus()
{
    local -r CONTAINER_NAME=${1:-mc-proxy}
    local -r STATUS=$(docker inspect -f '{{.State.Status}}' ${CONTAINER_NAME})
    local -r HEALTHY=$(docker inspect -f '{{.State.Health.Status}}' ${CONTAINER_NAME})
    echo "${STATUS} ${HEALTHY}"
}

function waitDockerStatus()
{
    local -r CONTAINER_NAME=${1:-mc-proxy}
    local -r TARGET_STATUS=${2:-running healthy}
    local -r TIMEOUT=${3:-60}
    local -r INTERVAL=${4:-5}
    local -r START_TIME=$(date +%s)
    local -r END_TIME=$((START_TIME + TIMEOUT))

    while true; do
        local STATUS=$(getDockerStatus ${CONTAINER_NAME})
        if [ "${STATUS}" = "${TARGET_STATUS}" ]; then
            echo "Container ${CONTAINER_NAME} is ${TARGET_STATUS}."
            return 0
        fi

        local CURRENT_TIME=$(date +%s)
        if [ ${CURRENT_TIME} -ge ${END_TIME} ]; then
            echo "Container ${CONTAINER_NAME} is not ${TARGET_STATUS} after ${TIMEOUT} seconds."
            #return 1
            exit 1 # force exit
        fi

        sleep ${INTERVAL}
    done
}


# data ディレクトリが１つでも無い場合は、初回セットアップとして作成します。
if [ ! -d proxy/data ] || [ ! -d lobby/data ] || [ ! -d server-1/data ]; then
    # SETUP_ONLY=true で、必要な設定ファイルだけ作成して終了させます。
    # ただし、proxy だけ SETUP_ONLY に対応していないため、
    # config/velocity.toml を modern に書き換えておく事で、
    # 対応する forwarding.secret ファイルが存在しない事により、
    # エラーでわざと失敗させます。
    clean # 中途半端な状態を消す
    mkdir -p proxy/data lobby/data server-1/data
    create_proxy_config
    #SETUP_ONLY=true docker compose create --build
    docker compose create --build

    docker compose start mc-proxy
    waitDockerStatus mc-proxy "exited unhealthy"

    docker compose start mc-lobby
    waitDockerStatus mc-lobby "running healthy"
    #
    # mc-lobby の PlaceholderAPI に追加の Expansion をダウンロードします。
    #
    docker exec -it mc-lobby rcon-cli papi ecloud download Player
    sleep 1
    docker exec -it mc-lobby rcon-cli papi ecloud download String

    docker compose start mc-server-1
    waitDockerStatus mc-server-1 "running healthy"

    docker compose down
fi

#
# forwarding.secret の生成
#
if [ ! -f proxy/data/forwarding.secret ]; then
    SECRET=$(openssl rand -hex 16)
    echo "${SECRET}" > proxy/data/forwarding.secret
else
    SECRET=$(cat proxy/data/forwarding.secret)
fi

bungeecord=false
velocity=true

#<data/spigot.yml>
#
#settings:
#  bungeecord: true
function set_spigot_bungeecord()
{
    local -r CONFIG=${1:-.}/data/spigot.yml
    if [ ! -f ${CONFIG} ]; then
        echo "${CONFIG} does not found."
        return 1
    fi
    echo "update ... <$CONFIG>"

    yq -i ".settings.bungeecord = ${bungeecord}" ${CONFIG}

    echo -e "\e[36msettings:"
    echo -en "  bungeecord: \e[35m"
    cat ${CONFIG} | yq '.settings.bungeecord'
    echo -en "\e[0m"
    return 0
}

#<data/config/paper-global.yml>
#proxies:
#  bungee-cord:
#    online-mode: true
#  proxy-protocol: false
#  velocity:
#    enabled: false
#    online-mode: true
#    secret: '<SECRET>'
function set_paper_velocity()
{
    local -r CONFIG=${1:-.}/data/config/paper-global.yml
    if [ ! -f ${CONFIG} ]; then
        echo "${CONFIG} does not found."
        return 1
    fi
    echo "update ... <$CONFIG>"

    read SECRET < proxy/data/forwarding.secret

    cat ${CONFIG} | \
    yq '.proxies."bungee-cord"."online-mode" = true' | \
    yq '.proxies."proxy-protocol" = false' | \
    yq ".proxies.velocity.enabled = ${velocity}" | \
    yq '.proxies.velocity."online-mode" = true' | \
    yq ".proxies.velocity.secret = \"${SECRET}\"" \
    > ${CONFIG}

    echo -e "\e[36mproxies:\e[0m"
    cat ${CONFIG} | yq -C '.proxies' | sed -re 's/^/  /'
    return 0
}

for server in lobby server-1; do
    set_spigot_bungeecord ${server} && set_paper_velocity ${server} || exit 1
done

#
# .env が未生成なら、.env.sample をコピーして生成します。
#
if [ ! -f .env ]; then
    cp .env.sample .env
    echo ".env.sample -> .env"
    echo "Please edit .env"
fi

