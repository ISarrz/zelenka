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
# Sprint 0: use `prisma db push` (no migration files yet). Once the schema
# starts evolving in Sprint 1, switch to `prisma migrate deploy` and commit
# migrations under prisma/migrations/.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
