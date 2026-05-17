# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

# install deps
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --include=dev

# generate prisma client + compile ts
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# tzdata so the container honors $TZ (Europe/Moscow) — without it, JS Date
# is stuck in UTC even with the env var set, and the morning-digest
# trigger can't compute quiet-hours-end in the user's local time.
RUN apk add --no-cache tzdata

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev && npm cache clean --force

# copy prisma artifacts + compiled output
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist

EXPOSE 8080
# Migrations live under prisma/migrations/. On first boot after the
# db-push → migrate switch (Sprint 7), the baseline `0_init` is marked
# applied with `migrate resolve`; the `|| true` makes that step
# idempotent on subsequent boots (resolve errors when the row already
# exists, which we want to ignore). Then `migrate deploy` applies any
# new migrations.
CMD ["sh", "-c", "npx prisma migrate resolve --applied 0_init >/dev/null 2>&1 || true; npx prisma migrate deploy && node dist/server.js"]
