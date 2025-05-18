#!/bin/bash
docker compose --file ../../docker-compose.yml up -d --build
docker container exec -itw ${PWD} node bash --login
docker compose --file ../../docker-compose.yml down --rmi local

