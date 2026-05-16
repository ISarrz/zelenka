# Perenual seed

The `perenual-db` service in `infra/docker-compose.yml` is seeded from
`perenual.sql.gz` in this directory.

That file is **not** committed (gitignored — 38 MB). Regenerate it from
the live Perenual mirror at `~/Desktop/perenual/` via:

```bash
./refresh.sh
```

The script does a `pg_dump` against the running `perenual_pg` container.
We never write to that container — only read. To refresh the upstream
mirror itself (new Perenual data), run inside `~/Desktop/perenual/`:

```bash
python -m perenual.cli fetch all
```

…then come back here and `./refresh.sh` again.

For server deploys, scp this `.sql.gz` to the server before `docker
compose up` — `infra/docker-compose.yml` mounts it into the
`perenual-db` container's initdb directory, so it loads on first boot
of a fresh volume.
