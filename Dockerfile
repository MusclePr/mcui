FROM node:lts-alpine
RUN apk -U --no-cache add tzdata bash
RUN apk -U --no-cache add docker-cli
ENV TZ=Asia/Tokyo
RUN adduser node ping
WORKDIR /app
COPY dist/index.js .
COPY dist/mcutil.js .
COPY assets assets
COPY yarn.lock .
COPY node_modules/ node_modules/
RUN yarn install --production
RUN yarn cache clean
USER node
ENTRYPOINT ["node", "index"]
CMD ["loop"]
