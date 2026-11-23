FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY drizzle.config.ts ./
COPY db/ ./db/

RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build

# ---- Runner ----
FROM node:22-alpine AS runner

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

# Pictures and files put on boards are kept here. docker-compose.yml puts a volume on this
# folder, so they stay when the app is updated. The app (user "node") must be able to write in it.
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# Run the app as the normal "node" user, not as root. If someone ever finds a way to run
# code through the app, they can't change the app's files or the rest of the container.
USER node

CMD ["/app/docker-entrypoint.sh"]
