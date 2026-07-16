FROM node:lts-alpine
RUN apk -U --no-cache add tzdata musl-locales bash su-exec
RUN apk -U --no-cache add docker-cli
# node ユーザーを作成（GID割り当てはentrypoint.shで動的に対応）
#RUN adduser -D -u 1000 node
ARG DEBUG
ENV DEBUG=${DEBUG:-""}
ENV TZ=Asia/Tokyo
ENV LANG=ja_JP.UTF-8
ENV LC_ALL=ja_JP.UTF-8
WORKDIR /app

COPY --chown=node:node dist/index.js .
COPY --chown=node:node dist/mcutil.js .
COPY --chown=node:node assets assets
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
RUN npm cache clean --force
RUN rm -f package.json package-lock.json

COPY --chown=node:node docker/assets/entrypoint.sh .
RUN chmod +x ./entrypoint.sh
RUN chown -R node:node /app/node_modules

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "index"]
