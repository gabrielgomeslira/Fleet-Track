# ADR-0006: Expor só o proxy Nginx como ponto de entrada, isolar backend e banco em rede interna e rodar containers sem privilégio
Status: proposto
Data: 2026-10-31
Histórias: H-09 (SEC-02, SEC-03 e SEC-07)
Revisto em 2026-11-02: CSP do mapa (ADR-0016) e fonte IBM Plex (ADR-0015).

**Estado na `master` (`fa67a8f`): quase nada desta decisão está aplicado.** Conferido em `frontend/templates/default.conf.template`, `frontend/Dockerfile` e `docker-compose.yml`:
- **Não há CSP nem nenhum outro cabeçalho de segurança.** O único `add_header` é o `Cache-Control` do `/config/mapa.json`.
- `MAP_CSP_ORIGINS` chega ao container, mas **nenhum template a usa**. A T-92 registrou isso como risco.
- `nginx:alpine` ouve na porta 80 e roda como root. O backend publica `${BACKEND_PORT}:5000`. Não há `read_only`, `cap_drop` nem rede interna.
- Faltam T-31, T-32 e T-33. A T-33 está condicionada à P7, mas só os timeouts e o `limit_req` dependem dela. **A CSP pode entrar antes.** A T-33 ainda cita `frontend/nginx.conf`, removido em `29a14e8`: o alvo agora é o template.

## Contexto
- Situação atual:
  - O backend publica `${BACKEND_PORT}:5000` em todas as interfaces, o que permite contornar o Nginx.
  - O CORS é `AllowAnyOrigin`.
  - Os containers rodam como root, sem `cap_drop`.
  - O Nginx não envia cabeçalhos de segurança e mostra a versão.
  - No working tree, o banco já está restrito ao loopback.
- O front consome `/api` na **mesma origem** via proxy, então nenhum navegador precisa de CORS.
- Quem instala pode usar só localhost (avaliação) ou publicar atrás de um terminador TLS (produção). O projeto não deve embutir TLS: certificado é responsabilidade de quem opera.
- Atributo: com a instalação padrão, apenas uma porta TCP fica alcançável, e só no loopback.

## Alternativas
| Opção | Prós | Contras | Custo de reverter |
|---|---|---|---|
| A. Manter as portas e só restringir CORS e o bind ao loopback | Mudança mínima | Duas superfícies (Nginx e Kestrel) para manter cabeçalhos e limites. CORS continua precisando de lista | Baixo |
| B. Adicionar um proxy dedicado (Traefik ou Caddy com TLS automático) | TLS automático | Peça nova. TLS automático exige domínio público, o que não serve para avaliação local | Médio |
| **C. Nginx do front como único ponto de entrada. Backend e banco sem `ports`, em rede `internal`. CORS desligado por padrão** | Uma superfície só, onde ficam cabeçalhos, limites e timeouts. Mesma origem elimina CORS | Nginx vira componente crítico (já era). Acesso direto ao banco para desenvolvimento passa a exigir arquivo de override | Baixo |

## Decisão
Opção C.

**Topologia**
- Redes:
  - `edge`: só o `frontend`.
  - `interna` (`internal: true`, sem saída para a internet): `frontend`, `backend` e `db`.
- `frontend` publica `${FLEET_BIND_ADDRESS:-127.0.0.1}:${FRONTEND_PORT:-3000}:8080`. O padrão é o loopback. Para servir na rede, quem instala muda conscientemente para `0.0.0.0` e coloca TLS na frente. O README traz um exemplo.
- `backend` e `db` ficam sem `ports`. Um `compose.dev.yml` opcional expõe `127.0.0.1:5432` e `127.0.0.1:5000` para desenvolvimento.

**CORS**
- Política vazia por padrão: nenhum cabeçalho CORS é emitido.
- `Cors__AllowedOrigins` aceita uma lista explícita para quem servir o front em outra origem. Curinga `*` é rejeitado na subida, que falha com mensagem.

**Containers**
- backend:
  - Imagem `aspnet:10.0` com `USER app` (UID não-root da imagem oficial) e porta 8080.
  - `read_only: true`, `tmpfs: /tmp`.
- frontend:
  - `nginxinc/nginx-unprivileged` na porta 8080.
  - `read_only: true`, `tmpfs` para cache e pid.
- Todos os serviços:
  - `security_opt: [no-new-privileges:true]`.
  - `cap_drop: [ALL]`. O `db` devolve só as capabilities que o entrypoint do Postgres exige (`CHOWN`, `SETUID`, `SETGID`, `FOWNER`, `DAC_OVERRIDE`) e roda o processo como `postgres`.
  - Limites de memória e CPU (premissa: backend 512 MB, db 1 GB, front 128 MB).
  - `healthcheck`.
- Imagens base fixadas por digest (H-04).

**Cabeçalhos (no Nginx, `always`)**
- `server_tokens off`
- `Content-Security-Policy`, gerada do template na subida do container (ADR-0016, item 8):
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${MAP_CSP_ORIGINS}; worker-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  ```
  - **O provedor do mapa só entra em `connect-src`.** O padrão é `MAP_CSP_ORIGINS=https://tiles.openfreemap.org`. Vazia, nada sai para terceiros. `img-src` não tem origem externa: a CARTO do texto original e o OSM saíram.
  - A fonte é a **IBM Plex, servida pelo próprio front** (ADR-0015). A Inter e o Google Fonts saíram.
  - `'unsafe-inline'` em estilo era exigência do Leaflet, que saiu. A bancada do ADR-0016 passou com ele ligado, e **ninguém testou sem ele**. Testar sem, na T-33, e o appsec revisa.
  - **Só a política foi testada, e numa bancada, não no produto.** O aceite é da T-33: console sem violação, com o mapa real e pelo Nginx real.
  - **Armadilha do `add_header`:** quem declara `add_header` num `location` perde os herdados. Hoje isso afeta `/config/mapa.json`. `/api/` receberá o `no-store`. Repetir os cabeçalhos com `include` em cada um. O `.mjs` do worker cai no `location /` e herda, desde que esse bloco não ganhe `add_header`.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`. Não muda com o mapa: o `Origin` do CORS sai de qualquer forma (ADR-0016).
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Frame-Options: DENY` (legado, redundante com `frame-ancestors`)
- Em `/api/`: `Cache-Control: no-store`
- `Strict-Transport-Security`: só documentado para o terminador TLS. Em `http://localhost` não tem efeito e pode atrapalhar outros serviços locais.

**Limites no Nginx**
- `client_max_body_size 64k` em `/api/`.
- `proxy_connect_timeout 5s` e `proxy_read_timeout 15s`.
- `limit_req` de 10 req/min por IP, rajada 5, em `/api/v1/auth/login`.
- O backend confia em `X-Forwarded-For` apenas vindo da rede `interna` (`ForwardedHeaders` com `KnownNetworks`).

## Consequências
- Positivas: atende os quatro critérios de H-09 com um único ponto para auditar. O padrão é seguro (loopback) e sair dele é decisão explícita de quem instala.
- Negativas:
  - Quem usava `localhost:5000` direto (scripts locais) passa a usar `localhost:3000/api`.
  - Quem acessa o banco no host precisa do `compose.dev.yml`.
- Monitorar: um teste de fumaça na CI sobe o compose e verifica que só a porta do front responde, que os cabeçalhos estão presentes e que `docker inspect` mostra `User` não-root.
