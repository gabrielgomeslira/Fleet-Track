FROM node:22-alpine AS build
WORKDIR /app
# Pacotes @carbon/* e @ibm/plex-* enviam telemetria de instalação à IBM (ADR-0015 §7).
ENV IBM_TELEMETRY_DISABLED=true
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Os templates viram /etc/nginx/conf.d/default.conf e mapa.json na subida do container.
COPY templates/ /etc/nginx/templates/
# .envsh e lido com source (precisa de x) pelo entrypoint antes do envsubst, no mesmo shell: os export valem para ele.
COPY --chmod=755 docker-entrypoint.d/15-mapa-desligado.envsh /docker-entrypoint.d/15-mapa-desligado.envsh
# Todas as variaveis precisam de ENV: o script de template so troca as definidas
# (ADR-0016, armadilha 2). Vazia e valida: MAP_TILEJSON_URL e MAP_CSP_ORIGINS vazias desligam o fundo.
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d     MAP_TILEJSON_URL="https://tiles.openfreemap.org/planet"     MAP_GLYPHS_URL="https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf"     MAP_STYLE_URL=""     MAP_CSP_ORIGINS="https://tiles.openfreemap.org"     MAP_CREDIT="OpenFreeMap|https://openfreemap.org;© OpenMapTiles|https://www.openmaptiles.org/"
EXPOSE 80
