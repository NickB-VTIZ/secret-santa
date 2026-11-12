# ── Stage 1: React frontend bouwen ───────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY index.html vite.config.js ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Productie-runtime ───────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY server/ ./server/

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Europe/Brussels

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/index.js"]
