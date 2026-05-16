# CLAUDE.md

Guidance for Claude Code working in this repository.

## Source of truth

Two human-written design documents in `docs/` are the source of truth. They
override anything below if there's a conflict:

- `docs/mvp-plan.md` — phased MVP plan, hardware decisions, scope, risks.
- `docs/design-summary.html` — wireframes and UX decisions per screen.
- `docs/schema.jpg` — final wiring of the sensor hardware.

Read the relevant section before touching code on a new feature.

## Repo layout

```
apps/
  api/          Fastify + TS + Prisma + Postgres (the backend)
  web/          Vite + React + TS + Tailwind PWA (the client)
firmware/       ESP-IDF project for ESP32-C3 Super Mini (the sensor)
infra/
  docker-compose.yml   full stack (app-db, perenual-db, api, web, caddy)
  caddy/Caddyfile      reverse proxy + TLS
  perenual-seed/       refresh.sh + the .sql.gz dump (gitignored, 38 MB)
  perenual-init/       initdb hook that creates the read-only Perenual user
docs/           mvp-plan.md, design-summary.html, schema.jpg
plant_id.txt    Plant.id API key (gitignored)
ssh.txt         prod SSH creds (gitignored)
```

There is no separate `legacy/`. The original Flutter app and C++ backend
were removed in the pivot commit; recover from git history if you ever
need to look at them.

## apps/api — backend

Stack: Fastify 5 + Prisma 6 + Postgres 16 + Zod, all TypeScript, ESM
(`type: module`), running on Node 22 in Docker.

### Common commands

Run inside the `api` container (or locally with `npm install` first):

- `npm run dev` — Fastify with tsx watch.
- `npm run build` — `tsc`.
- `npm start` — run compiled output.
- `npm run prisma:generate` — regenerate Prisma client after schema edits.
- `npx prisma db push` — apply schema to the connected DB (Sprint 0
  strategy — no migration files yet). Switch to `prisma migrate dev` /
  `migrate deploy` the first time the schema needs to evolve in Sprint 1.

### Routes (Sprint 0)

All under `/api/*` so Caddy routes the whole prefix to this container with
a single rule. The PWA always talks to its own origin's `/api/*`, no CORS
in prod.

- `GET  /api/healthz`, `/api/readyz` — health probes.
- `POST /api/auth/magic-link/request` `{email}` — creates user if needed,
  emits a one-time token, sends URL via the `MAIL_TRANSPORT` (Sprint 0:
  `console`).
- `POST /api/auth/magic-link/consume` `{token}` — sets a session cookie.
- `POST /api/auth/logout`, `GET /api/me`.
- `GET  /api/devices`, `POST /api/devices` `{name}` — user CRUD.
- `GET  /api/devices/:id/latest` — last measurement for a user's device.
- `POST /api/device/measurements` — sensor write path. **Authenticated by
  `Authorization: Bearer <deviceToken>`**, not by user session.

### Schema (Sprint 0)

`prisma/schema.prisma` — `User`, `MagicLinkToken`, `Session`, `Device`,
`Measurement`. `Measurement` fields are all nullable so firmware can add
sensors without DB migrations every time. Indexes on
`(deviceId, measuredAt)`.

Plants, care rules, push subscriptions, plant↔species bindings — Sprint 1+.

## apps/web — PWA

Stack: React 19 + Vite 6 + TypeScript + Tailwind 3 (`darkMode: 'media'`,
status color tokens) + React Router. Static-served by nginx in the
container.

### Common commands

Run inside the `web` container (or locally with `npm install`):

- `npm run dev` — Vite on `0.0.0.0:5173` with `/api/*` proxied to
  `VITE_API_BASE` (default `http://localhost:8080`).
- `npm run build` — type-check + production bundle.
- `npm run typecheck` — TS without emit.

### Pages (Sprint 0)

- `/auth` — email → magic-link request.
- `/auth/consume?token=…` — consumes the token, sets the session cookie,
  redirects to `/`.
- `/` — main screen. If no device: prompt to add one (auto-issues a token
  shown in plain text for the firmware operator). Otherwise: cold-start
  dashed ring placeholder + four sensor cells (temperature, humidity,
  lux, soil). Polls `/api/devices/:id/latest` every 10 s.

### Design rules that bind code

These come from `docs/design-summary.html` and constrain implementation,
not just visuals:

- Status color travels on rings / borders / icons. **Never on body text** —
  it breaks in dark mode and reads as alarm.
- No "I watered / I moved it" buttons. The sensor detects everything; UI
  only shows what was detected and the instruction.
- Push texts are actions with numbers ("Полейте 150 мл"), not alerts.
  Title ≤40 chars, body ≤100. Plant name in title. No exclamations.
- 48-hour cold start. While in cold start: dashed gray ring, numbers
  without a verdict, no scolding for "bad" values.
- Russian only on MVP. No fake-i18n abstraction yet.

## firmware/ — ESP32-C3 sensor

Stack: ESP-IDF (not Arduino) on ESP32-C3 Super Mini. Inline drivers for
BME280, BH1750, soil V1.2 (ADC1_CH4), RGB LED.

### Common commands

```bash
. ~/esp/esp-idf/export.sh
cd firmware/
idf.py set-target esp32c3
idf.py menuconfig    # → "Zelenka" submenu: WIFI_SSID, WIFI_PASSWORD,
                     #   API_URL, DEVICE_TOKEN, SAMPLE_INTERVAL_SEC
idf.py build flash monitor
```

`firmware/README.md` has the full pin map and LED legend.

### Sprint 2 firmware state

- **Provisioning**: SoftAP `Zelenka-XXXX` (AP MAC, which is STA+1) +
  captive portal at `192.168.4.1`. RU form for SSID / Wi-Fi password /
  device token. DNS hijack + DHCP option 6 force the device's IP as
  DNS so iOS/Android show the captive sheet. Result saved to NVS,
  device reboots into STA mode.
- **Touch factory reset**: TTP223 DO on GPIO10. Held ≥3 s through a
  **power-on** boot → wipe NVS → reboot into provisioning. Deliberately
  ignored on USB/SW resets (DTR-pulse from a debugger would otherwise
  wipe creds every time).
- **Operational cycle**: wake → sample → store in RTC-RAM buffer
  (6 slots, survives deep sleep). When full: Wi-Fi up → NTP if not
  synced → backfill 0-epoch timestamps by extrapolation → POST batch
  → clear. Otherwise straight to deep sleep. 10-min interval =
  one POST per hour, ~0.7 % awake duty cycle.
- **Flash layout**: 4 MB chip, custom `partitions.csv` (2 MB factory
  app, 1 MB spiffs reserve). HTTPS cert bundle pushes the image
  past the stock 1 MB partition.

### Sprint 3 firmware additions

- **OTA over HTTPS**. Dual-bank partitions (`ota_0` / `ota_1` + `otadata`).
  Every successful batch POST is followed by a fetch of
  `/api/firmware/manifest.json`. If `version` differs from the running
  `app_desc.version`, `esp_https_ota` downloads and applies the bundle,
  then reboots. The first fully-successful cycle on a new image cancels
  the pending rollback; if that cycle fails, the bootloader reverts to
  the previous bank automatically.
- **Versioning**: `CONFIG_APP_PROJECT_VER` in `sdkconfig.defaults`. Bump
  + rebuild + `infra/firmware-publish.sh` + rsync to server. Devices
  pick up the update on their next cycle without USB access.

### Still deferred (Sprint 4+)

- LittleFS spill-over for prolonged offline. RTC RAM holds the current
  hour of samples; longer outages still drop old data on overflow.
- Battery measurement. Server-side `battery_estimate` field will be
  populated once a hardware divider or fuel gauge is added.

## infra/ — the stack

See `infra/README.md` for the run book. Short version:

```bash
infra/perenual-seed/refresh.sh   # snapshot live Perenual; gitignored output
cp infra/.env.example infra/.env.dev
$EDITOR infra/.env.dev           # set passwords, WEB_HOST=:80 for dev
docker compose -f infra/docker-compose.yml --env-file infra/.env.dev up --build
```

Then open `http://localhost/`. Magic-link URL prints to API stdout
(`docker compose logs api`).

### Perenual catalog — read-only contract

The upstream Perenual mirror lives at `~/Desktop/perenual/` (its own
docker-compose, container `perenual_pg` on port 5433). **Do not write to
it**, do not modify its data, do not put our containers on its network.
Refresh our local copy by running the upstream's own fetch and then
`infra/perenual-seed/refresh.sh` (which only `pg_dump`s the upstream
container, never connects with anything else).

Inside our compose, `perenual-db` is an independent container seeded from
that dump. The API connects via a dedicated `perenual_ro` user that has
SELECT-only privileges on every table.

## Product principles (binding for new code)

These constrain implementation, not just UI. Don't write code that
violates them without first changing the design doc.

- **Traffic light home screen.** Ring around the plant photo answers
  "is everything OK?" in one second. Five modes incl. 48 h cold start.
- **Sensor is the source of truth.** All actions detected from sensor
  jumps. No manual "I watered" logging.
- **Push = action with numbers**, not alert text.
- **Push fires on two kinds of events only** (defined in design doc
  "Когда вообще приходит пуш") with cooldowns, daily caps, and quiet
  hours that mute everything by default.
- **No gamification, no badges, no streaks, no social, no chatty AI tips.**
- **RU-only on MVP.**

## Tech decisions worth keeping in mind

- Auth: magic link only (no passwords). User-side via HttpOnly session
  cookie. Device-side via opaque `deviceToken` Bearer.
- Plant.id: routed via backend, never from the client. 3 identifications
  / week / user (rolling 7 days), 80% confidence threshold. Sprint 0
  doesn't surface it yet — the key in `plant_id.txt` lands in env in
  Sprint 1.
- Battery indicator (when firmware starts reporting): 4 qualitative
  states only (full/medium/low/critical), never a percentage. Per-device
  `cycles_per_full_battery` self-learns after each marked recharge.
- Image storage / serving: TBD when we get to the plant card. The
  upstream Perenual mirror has 5.6 GB of images on disk but we don't ship
  them in containers — links from `raw_json` are an option.

## Secrets

All gitignored — never paste into commits, PR bodies, or external systems:

- `plant_id.txt` — Kindwise Plant.id API key.
- `plantNet_key.txt` — leftover PlantNet key from the deleted legacy
  server. Not used by the new code; safe to delete if you want, but the
  user hasn't said so.
- `perenual_key*.txt` — Perenual API key(s) used by
  `~/Desktop/perenual/`. Multiple files supported there for free-tier
  rotation.
- `ssh.txt` — prod root SSH credentials.
- `infra/.env.dev`, `infra/.env.prod` — DB and service passwords.

## Working with Claude Code on this repo

Per `docs/mvp-plan.md` § 8: when starting on a new screen or endpoint,
paste in the relevant section of the design doc and any related diff.
Without that, Claude Code tends to drift toward generic web-app patterns
(manual logging buttons, percentage battery indicators, statuses
expressed as text colors) — all things this product explicitly rejects.

Sprint plan: `docs/mvp-plan.md` § 5. Open questions: `docs/mvp-plan.md`
§ 7 and `docs/design-summary.html` § "Открытые вопросы".
