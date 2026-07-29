# Pipeline Comercial Mauad
#
# Servidor Node.js puro (node:http) servindo uma SPA estatica de public/.
# Nao ha build step: sem bundler, sem TypeScript, sem transpilacao.
# Unica dependencia: @neondatabase/serverless (JS puro, sem binarios nativos),
# por isso Alpine e seguro aqui.

FROM node:22-alpine

# dumb-init como PID 1: garante que o SIGTERM do EasyPanel encerre o processo
# imediatamente, em vez de esperar o timeout de 10s a cada redeploy.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

WORKDIR /app

# Copia so o manifesto antes do codigo: o cache de camadas do Docker evita
# reinstalar a dependencia a cada alteracao no server.js.
COPY package.json ./

# npm install, nao npm ci: o projeto nao tem lockfile e o npm ci falharia.
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Apenas o que o runtime precisa. Ver .dockerignore para o que fica de fora.
COPY server.js ./
COPY public ./public

# Fallback de persistencia em arquivo, usado quando POSTGRES_URL nao esta
# definida. Criado com dono correto porque o processo roda como non-root.
RUN mkdir -p /app/data && chown -R node:node /app

USER node

# HOST=0.0.0.0 e a linha mais importante deste arquivo.
# O default do server.js e 127.0.0.1, que faz o container subir com logs
# saudaveis e mesmo assim ficar inalcancavel pelo proxy do EasyPanel.
ENV HOST=0.0.0.0 \
    PORT=4173 \
    DATA_DIR=/app/data

EXPOSE 4173

# Bate em GET / (index.html estatico, sempre 200). Nao usar /api/*: essas rotas
# chamam loadDb() e retornam 401 na maioria dos casos, o que marcaria o
# container como unhealthy indevidamente.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- --spider "http://127.0.0.1:${PORT}/" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
