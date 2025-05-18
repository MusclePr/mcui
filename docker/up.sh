#!/bin/sh
trap ./down.sh INT TERM
if [ -e ./server-1/data/.stop-from-mcui ]; then
  OPT=--no-start
  echo "no start"
  docker compose up --build -d --no-recreate ${OPT}
  docker compose start mcui
  docker compose logs -f && ./down.sh
else
  docker compose up --build && ./down.sh
fi
