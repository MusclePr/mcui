FROM node:lts-alpine
RUN apk -U --no-cache add tzdata musl-locales bash su-exec
RUN apk -U --no-cache add docker-cli
# dockerグループ(GID:999)として、nodeユーザーを追加 (alpineのGID:999は、pingグループ)
RUN adduser node ping
ARG DEBUG
ENV DEBUG=${DEBUG:-""}
ENV TZ=Asia/Tokyo
ENV LANG=ja_JP.UTF-8
ENV LC_ALL=ja_JP.UTF-8
WORKDIR /app

COPY dist/index.js .
COPY dist/mcutil.js .
COPY assets assets
COPY package.json yarn.lock ./
RUN yarn install --production
RUN yarn cache clean
RUN rm -f package.json yarn.lock

COPY docker/assets/entrypoint.sh .
RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "index"]
