# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --include=dev

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY tailwind.config.ts postcss.config.js index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

# --- runtime stage: static serving via nginx ---
FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5173
