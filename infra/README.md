# infra/

Single-file stack: `app-db` (our Postgres) + `perenual-db` (read-only catalog
mirror) + `api` (Fastify) + `web` (Vite PWA via nginx) + `caddy` (TLS / reverse
proxy).

## First-time setup

```bash
# 1. Get the Perenual seed (38 MB). Won't be committed.
infra/perenual-seed/refresh.sh

# 2. Copy and fill the env file
cp infra/.env.example infra/.env.dev
$EDITOR infra/.env.dev

# 3. Load Plant.id key (dev convenience)
echo "PLANT_ID_API_KEY=$(cat plant_id.txt)" >> infra/.env.dev
```

## Dev (everything on this machine)

```bash
docker compose -f infra/docker-compose.yml --env-file infra/.env.dev up --build
```

Open <http://localhost/>. Magic-link emails are logged to the api container's
stdout — grab the URL there and paste it into the browser.

## Refresh the Perenual mirror

When the upstream mirror at `~/Desktop/perenual/` is updated, refresh our
seed:

```bash
infra/perenual-seed/refresh.sh
# then nuke and rebuild the perenual-db volume (otherwise initdb won't re-run)
docker compose -f infra/docker-compose.yml down
docker volume rm zelenka_perenual_db_data   # confirm exact name first
docker compose -f infra/docker-compose.yml --env-file infra/.env.dev up --build
```

## Deploy to the server

```bash
# from this machine, rsync the working tree. The exclude list keeps secrets
# (.env.dev/.env.prod live only on the server) and binary artifacts off the
# wire. The `infra/.env.*` exclude is critical — without it `--delete` will
# remove the server's env file.
rsync -az --delete \
  --exclude='.git/' --exclude='node_modules/' --exclude='build/' \
  --exclude='dist/' --exclude='cmake-build-*/' --exclude='managed_components/' \
  --exclude='sdkconfig' --exclude='sdkconfig.old' --exclude='*.log' \
  --exclude='infra/.env.*' \
  ./ root@<server>:/srv/zelenka/

# the perenual seed is gitignored, send it separately when refreshed:
scp infra/perenual-seed/perenual.sql.gz root@<server>:/srv/zelenka/infra/perenual-seed/

# then on the server:
cd /srv/zelenka
docker compose -f infra/docker-compose.yml --env-file infra/.env.prod up -d --build
```

If you ever **do** want to rotate `.env.prod` passwords, remember the Postgres
volumes won't accept the new passwords automatically — initdb runs only on
empty volumes. Either `ALTER USER ... WITH PASSWORD '…';` inside each DB or
nuke the volumes (and the data).
