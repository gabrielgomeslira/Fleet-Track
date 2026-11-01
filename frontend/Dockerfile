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
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
