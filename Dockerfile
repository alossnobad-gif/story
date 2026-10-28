# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY server/core.js ./server/core.js
RUN npm run build
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/app/data
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --omit=dev && mkdir -p /app/data && chown node:node /app/data
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--use-env-proxy", "server/index.js"]
