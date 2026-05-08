# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This directory holds **two independent projects**, each with its own `.git`:

- `zelenka/` — Flutter mobile app (the client).
- `zelenka_server/` — C++20 HTTP backend serving `http://zelenka-api.ru` on port 80.

They are not built or versioned together. `cd` into the relevant subdirectory before running build/test commands.

## zelenka/ — Flutter app

### Common commands
Run from `zelenka/`:
- `flutter pub get` — install deps.
- `flutter run` — run on the connected device/emulator.
- `flutter test` — run the test suite (`test/widget_test.dart`).
- `flutter test test/widget_test.dart --plain-name "<name>"` — run a single test by name.
- `flutter analyze` — lint (config in `analysis_options.yaml`, uses `flutter_lints`).
- `dart run build_runner build --delete-conflicting-outputs` — regenerate Hive adapters (`*.g.dart`) after editing `@HiveType` models such as `lib/repositories/models/user.dart`.
- `dart run flutter_launcher_icons` — regenerate launcher icons from `assets/icon.png`.

### Architecture
- **DI:** `GetIt` is configured in `lib/main.dart::setupDependencies()`. `AbstractUserRepository` is registered as a singleton wrapping `Dio`; features resolve it via `GetIt.I<AbstractUserRepository>()`.
- **State:** `flutter_bloc`. Each feature under `lib/features/<feature>/` follows the layout `bloc/`, `view/`, `widgets/` (see `auth_page`, `register_page`). New screens should follow this layout. Pure UI screens like `home_page` and `ble_config_page` skip the `bloc/` folder.
- **Routing:** Static map in `lib/router/router.dart` (`/auth`, `/register`, `/home`, `/ble-config`). The initial route is decided in `main.dart` based on credentials in `SharedPreferences` and the cached `User` in the Hive `userBox`.
- **Persistence:** Two complementary stores — `SharedPreferences` holds `saved_login` / `saved_password`; Hive box `userBox` (key `currentUser`) holds the `User` object for offline login fallback. If the network is unreachable but a cached user exists, `main.dart` routes to `/home` in offline mode.
- **Networking:** All HTTP goes through `lib/repositories/user/user_repository.dart` against `http://zelenka-api.ru`. Endpoints: `/user/auth`, `/user/register`, `/user/insert-device`, `/user/get-devices`, `/user/get-device-monitorings`, `/user/remove-device`. Auth is "send login+password with every request" — there is no token.
- **BLE:** `flutter_blue_plus` + `permission_handler` for the `ble_config_page` flow that provisions devices.

## zelenka_server/ — C++ backend

### Common commands
Run from `zelenka_server/`:
- `docker compose up --build` — preferred path. Brings up a MySQL 8 container and the app container together; `.env` (in this directory) supplies DB and API secrets, and the app container reads them as environment variables. The app listens on host port 80.
- Local CMake build (requires `libmysqlcppconn-dev`, `nlohmann-json3-dev`, C++20 toolchain):
  ```
  cmake -S . -B build && cmake --build build -j
  ```
  Produces `build/zelenka_server`. CLion's `cmake-build-debug/` is also checked in for IDE workflows.
- Run: `./build/zelenka_server server` (the `config` subcommand is reserved per `scripts/main.cpp::ShowHelp` but not yet wired up — the server reads config from env vars).
- There are no automated tests.

### Architecture
- **Entry point:** `scripts/main.cpp` calls `config::InitConfig` (loads env vars into `config::` globals) and then constructs `Server()`, which blocks on `httplib::Server::listen("0.0.0.0", 80)`. On startup it dumps every user to stdout — useful for sanity-checking the DB connection.
- **HTTP layer:** Built on a vendored `httplib.h` (single header at the project root). `modules/Server/Server.cpp` constructs all repositories and registers four route groups via static methods on `Routes` (`Routes.hpp`):
  - `RegisterGreetingRoute` (`Routes/Debug/Debug.cpp`) — `GET /hi`
  - `RegisterUserRoutes` (`Routes/User/User.cpp`) — `POST /user/{register,auth,get-devices,insert-device,remove-device,get-device-monitorings}`
  - `RegisterSensorRoute` (`Routes/Device/Device.cpp`) — `POST /device/insert-monitoring` (called by ESP/sensor devices, not the mobile app)
  - `RegisterAdminRoutes` (`Routes/Admin/Admin.cpp`) — `POST /admin/{user,device}/{get-all,remove-by-id,insert}`
- **Unusual build pattern — admin routes are concatenated, not linked:** `Routes/Admin/Admin.cpp` does `#include "User.cpp"` and `#include "Device.cpp"` to pull the admin sub-route definitions in as a single translation unit. Those sub-files are deliberately **not** listed in `CMakeLists.txt`. When adding a new admin route file, follow the same pattern (add a `#include "Foo.cpp"` to `Admin.cpp`) rather than adding it to `CMakeLists.txt`, or you'll get duplicate-symbol link errors. The non-admin routes (`User/User.cpp`, `Device/Device.cpp`) are normal TUs and *are* listed in `CMakeLists.txt`.
- **Database:** MySQL via `mysql-connector-c++`. `Database` (in `modules/Database/Database/Database.cpp`) owns the `sql::Connection`. Each repository (`UserRepository`, `DeviceRepository`, `DeviceMonitoringRepository`) takes a `Database*` and exposes prepared-statement-based CRUD; abstracts live next to them as `AbstractXxxRepository.hpp`. The umbrella header `modules/Database/Database.hpp` re-exports everything in the layer — include it from new code rather than the inner headers.
- **Config:** `modules/Config/Config.cpp` reads env vars `DB_USER`, `DB_PASSWORD`, `YANDEX_KEY`, `YANDEX_SECRET_KEY`, `SECRET_KEY` into globals in the `config::` namespace. `DB_HOST` and `DB_NAME` are read directly by `Database` from the environment. `docker-compose.yml` overrides `DB_HOST=db` for the app container.
- **Auth model:** No sessions/tokens. Every authenticated route accepts `{login, password}` in the JSON body and re-validates against the DB. Admin endpoints currently rely on the same scheme.

### CMake gotcha
`CMakeLists.txt` enumerates every source file by hand. After adding a new non-admin `.cpp`, you must add it to the `add_executable` list or it won't be compiled. (See the admin-routes note above for the exception.)

## Secrets
`zelenka_server/.env` is checked in and contains real-looking DB and API credentials. Do not paste it into commits, PR descriptions, or external systems; treat it as sensitive even though git already tracks it.
