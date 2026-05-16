#!/bin/bash
# Runs after the Perenual dump is loaded (01_perenual.sql.gz). Creates a
# read-only user the API uses to query the catalog without ever being able to
# modify it.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER perenual_ro WITH PASSWORD '${PERENUAL_RO_PASSWORD}';
  GRANT CONNECT ON DATABASE perenual TO perenual_ro;
  GRANT USAGE ON SCHEMA public TO perenual_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO perenual_ro;
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO perenual_ro;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO perenual_ro;
EOSQL
