# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project pivot (2026-05)

The project was redesigned. The **target architecture** below replaces the original Flutter + C++ implementation. Two source-of-truth documents live at the repo root:

- `plant-sensor-mvp-plan(1).md` — phased MVP plan, hardware decisions, scope, risks.
- `zelenka-design-summary.html` — wireframes and UX decisions for every screen.

Both are required reading before touching anything new. The MD has the engineering decisions; the HTML has the product/UX decisions. **They override anything in this file if there is a conflict.**

### Status of existing subprojects

| Subdir | Status |
|---|---|
| `app/` (Flutter mobile app) | **Legacy.** Being replaced by a PWA. Do not extend with new features. Bug fixes only if explicitly asked. |
| `server/` (C++20 / httplib / MySQL backend) | **Legacy.** Being replaced by Node.js + Fastify + Prisma + PostgreSQL. Do not extend. |
| `plants_db/` (Python ETL) | **Kept**, but retargets output: instead of `server/initdb/plants_catalog.sql` (MySQL), it will produce a Postgres seed for the new backend, filtered to the curated **top ~50 species** (not 200). |
| `tests/` (sensor data simulator) | Probably reusable against the new backend once the device-ingest endpoint exists. |

New code lands in new top-level directories (see "Target layout" below), not inside `app/` or `server/`.

---

## Target layout

```
zelenka/
├── apps/
│   ├── web/         # PWA — React + Vite + TS + Tailwind + shadcn/ui
│   └── api/         # Backend — Node.js + Fastify + TS + Prisma + PostgreSQL
├── firmware/        # ESP-IDF project for ESP32-C3
├── plants_db/       # Curated plant DB ETL (kept, retargeted to Postgres seed)
├── app/             # LEGACY Flutter app (frozen)
├── server/          # LEGACY C++ backend (frozen)
├── tests/           # Cross-cutting test utilities
├── plant-sensor-mvp-plan(1).md
└── zelenka-design-summary.html
```

This structure is **planned**, not yet created. As subprojects come online, document their toolchain commands here.

---

## Product principles (binding for UX/code)

These are not style preferences — they are decisions Claude Code must respect when writing screens, copy, push texts, or notification logic.

- **Traffic light home screen.** The main screen answers "is everything OK?" in one second via a colored ring around the plant photo. Five modes (incl. 48-hour "cold start" = dashed gray ring, numbers without verdict).
- **Sensor is the source of truth.** No "I watered / I moved it" buttons. All care actions are detected from sensor jumps. Do not add manual logging UI for things the sensor measures.
- **Notifications are actions, not alarms.** Push text is an instruction with numbers ("Полейте 150 мл тёплой отстоянной воды"), not a problem report ("Влажность ниже 30%"). Neutral tone, no exclamations, no "осторожно/срочно". Title ≤40 chars, body ≤100. Plant name in title.
- **Push only on two event types** (defined in design doc § "Когда вообще приходит пуш") with explicit anti-spam rules: cooldowns, daily limit, quiet hours muting everything by default (urgent night events surface in a single morning digest).
- **Status color is carried by ring / cell border / icons, never by text.** Body copy stays neutral and dark-theme-safe.
- **No gamification, no badges, no streaks, no social feed, no chatty "AI tips".** If a feature smells like marketing fluff, it is out of MVP.
- **Russian only on MVP.** Copy is written in Russian first; translation is a separate effort, not a `.format()` away.

When implementing a screen, cross-check the corresponding section of `zelenka-design-summary.html` for the wireframe and the "Ключевые решения" bullets.

---

## Tech decisions (binding)

### Hardware (`firmware/`)

- **Board:** ESP32-C3 Super Mini (4 MB flash). Pinout in `plant-sensor-mvp-plan(1).md` § 3.1.
- **Sensors:** BME280 (I2C, temp/humidity/pressure) + BH1750/GY-30 (I2C, lux) + capacitive V1.2 soil moisture (ADC on GPIO4). Shared I2C on GPIO8 (SDA) / GPIO9 (SCL).
- **Framework:** **ESP-IDF**, not Arduino.
- **Power:** Li-Po 3.7 V 450 mAh + TP4056 charger + boost converter. Lower TP4056 current to ~225 mA via resistor swap. Reset button on GPIO10 (long-press → wipe NVS → SoftAP).
- **Cycle:** measure every 10 min, batch POST every hour (6 readings). Ring buffer in RTC RAM (~8 KB / ~3 days). Out-of-band send when a value crosses a critical threshold. LittleFS fallback on prolonged offline.
- **Provisioning:** SoftAP + captive portal at `192.168.4.1`. Device-ID is read from the AP SSID — **do not ask the user to type it in.**
- **OTA:** HTTPS, planned from day one (don't bolt on later).
- **Battery indicator is software-only.** No voltage divider. Device sends `cycles_since_charge` + `last_full_charge_timestamp` in NVS with every batch; server estimates `battery_estimate ∈ {full, medium, low, critical}` using a per-device-calibrated `cycles_per_full_battery`. Self-learning: every "marked charged → next marked charged" cycle refines the per-device value. "I charged it" button in PWA tells server to push a reset command on next device check-in.
- **Phase 0 must verify** (decisions hinge on real numbers): boost-converter quiescent current (target < 200 µA) and Wi-Fi antenna reach through 1–2 interior walls. Both can sink the autonomy target (1.5–2 months) or force a hardware change.

### Backend (`apps/api/`)

- **Stack:** Node.js + TypeScript + **Fastify** + **Prisma** + **PostgreSQL**.
- **Hosting:** Railway / Render / Fly.io for the API, Neon (or managed PG) for the DB.
- **Auth:**
  - **Users:** magic link to email (Resend / Postmark). No password. Name is optional, captured later.
  - **Devices:** `device_token`, **not** user email+password. Tokens issued at pairing.
- **Push:** Web Push API + VAPID + `web-push` library. Subscription on the front; sending on the back; deep links open the relevant plant card.
- **Plant.id (Kindwise) — proxied through the backend** so the API key never reaches the client. **3 identifications/week/user, rolling 7 days**, enforced server-side. Confidence threshold 80% (auto-apply ≥80%, top-3 picker <80%, manual fallback to curated DB or "общий профиль" / generic profile if exotic). Plant.id response is **not cached for re-pick** — re-identification = new request = one credit. One request = one credit regardless of how many photos (1–3) are attached. Sensor reset does **not** reset the user's weekly quota.
- **Plant knowledge:** the curated top-50 DB (RHS / Missouri Botanical Garden / IFAS, cross-checked) is the primary source. Perenual is fallback with a visible "общие рекомендации, могут быть неточны" note. An `overrides` table (user_id + plant_species_id) is reserved for future crowdsourcing — schema in from day one, no UI yet.
- **DB schema** at minimum: `users, devices, plants, plant_species, measurements, care_log, notifications, push_subscriptions, overrides, device_charges` (last one drives the cycles-per-battery self-learning).
- **Observability:** Sentry (free) + an uptime probe + Plausible/Umami/PostHog free tier for product analytics.
- **No sessions on the device path** — devices authenticate by `device_token` per request. User routes use magic-link sessions.

### Frontend (`apps/web/`)

- **Stack:** React + Vite + TypeScript + Tailwind + **shadcn/ui**.
- **PWA:** `vite-plugin-pwa`, Service Worker, manifest, icons, splash. Install flow is **mandatory on iOS** (Web Push only works in installed PWA) — design doc has the 3-step "Add to Home Screen" walkthrough that must be implemented faithfully. On Android, Chrome's install prompt is used and the screen is skippable.
- **Hosting:** Vercel / Cloudflare Pages.
- **Landing:** QR on the device box carries a query param that **skips the landing** and goes straight to login. Magic-link flow has a 30 s resend cooldown.
- **Battery indicator:** four qualitative states only (full/medium/low/critical) — never show a percent number, only a rough "≈N days remaining" hint after first full cycle. Tooltip explains "estimate based on usage". "Я зарядил датчик" button sits next to it.
- **Multi-device / multi-plant** is in MVP scope. Dropdown picker in the header, swipe to switch the focused plant on the main screen, indicator dots, filter chip in the events feed. Wireframes in design doc § "Несколько растений".

### `plants_db/` retarget

The pipeline structure (`raw_* → species_curated → mart`) is unchanged, but:

- The **mart filter** narrows from `popular_species` (200) to the **curated top-50** referenced in the MVP plan. The 50-species list itself is a Phase 0 deliverable and is not yet committed.
- The **export target** changes from MySQL (`server/initdb/plants_catalog.sql`) to a Postgres seed consumed by Prisma's seeding mechanism (e.g. `apps/api/prisma/seed.ts` or a `.sql` companion). The exact format will be decided once the Prisma schema lands.
- Group aggregation (`plant_groups` with default care ranges) is still useful as a fallback for "общий профиль" — keep it.

Until the new backend lands, `plants_db/` should not be re-run for production; the existing `server/initdb/plants_catalog.sql` is for the legacy server only.

---

## Phased plan (high-level — full version in `plant-sensor-mvp-plan(1).md` § 5)

0. **Prep** — curate top-50, register Plant.id / domains / VAPID / Resend / Sentry, draw wireframes, **measure quiescent current and Wi-Fi reach**.
1. **Backend skeleton** — Fastify + Prisma + schema + device endpoints + magic link + Plant.id proxy + battery estimation logic + deploy.
2. **Firmware** — ESP-IDF, sensors, deep-sleep loop, RTC-RAM buffer, Wi-Fi batch send, captive portal, OTA, `cycles_since_charge`.
3. **Frontend skeleton + onboarding** — PWA shell, magic link, pairing flow, identification (Plant.id), calibration, place-picking ("walk around 30 s"), traffic-light home, battery icon.
4. **Notifications and actions** — server-side rule engine, 12 triggers (incl. low battery a week before estimated empty), overwatering guard, Web Push wiring, deep links.
5. **Plant card and history** — full plant page, 7/30-day charts per parameter, care-event markers, history list, manual back-dated entries, multi-plant switching, post-first-cycle battery-days estimate.
6. **Polish and real test** — 5 end-to-end runs with real users, rewrite copy out of "ChatGPT voice", edge cases (3-day sensor outage, identification dead-ends, broken sensor, "forgot to press 'I charged it'"), analytics, backups, monitoring.

Realistic estimate: ~4 months at 20 h/week. Optimistic: ~10 weeks.

---

## Open questions / deferred decisions

Tracked in `plant-sensor-mvp-plan(1).md` § 7 and `zelenka-design-summary.html` § "Открытые вопросы". Notable:

- Exact Plant.id confidence threshold (80 % is a starting hypothesis).
- Adaptive sampling rate (slower at night) — decided during firmware phase.
- Whether to switch to a hardware battery gauge (MAX17048 / voltage divider) if software estimation drifts too far in real use.
- Boost-converter choice pending Phase-0 current measurement.
- Per-species notification copy (only Ficus is drafted in the design doc).
- API contracts, push payload schema, device wire format, history retention, offline→online sync — to be designed alongside the backend.

---

## Secrets (unchanged from legacy)

- `server/.env` — DB and API credentials for the **legacy** stack. Gitignored.
- `ssh.txt` at repo root — prod root SSH credentials. Gitignored, never paste anywhere.
- `perenual_key*.txt` at repo root — Perenual API keys for `plants_db/import_perenual.py`. Gitignored. Multiple files = multiple keys for free-tier quota rotation on 429.

For the new stack, secrets will live in `apps/api/.env` (gitignored). Plant.id key, Resend key, VAPID keypair, database URL, Sentry DSN all go there.

---

## Working with Claude Code on this repo

Per `plant-sensor-mvp-plan(1).md` § 8: always attach the relevant section of the MVP plan and the design doc when prompting on a new screen or endpoint. Without that context, decisions tend to drift back toward generic web-app patterns and away from the deliberate constraints above (no manual care buttons, sensor-driven detection, neutral copy, qualitative battery states, etc.).

If you find yourself adding something not in the two source docs — pause and ask whether it belongs in MVP or is a postMVP backlog item.
