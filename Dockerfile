FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY drizzle.config.ts ./
COPY db/ ./db/

RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build

# ---- Runner ----
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /app/.output /app/.output
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/drizzle.config.ts /app/drizzle.config.ts
COPY --from=builder /app/db /app/db

EXPOSE 3000

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

CMD ["/app/docker-entrypoint.sh"]
