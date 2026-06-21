# Troubleshooting

Operational gotchas for local development. Add to this as you hit (and fix) things.

## Local dev environment

Local Postgres (with pgvector) runs via Docker Compose:

```bash
docker compose up -d     # start Postgres on :5432
docker compose down      # stop
docker compose down -v   # stop and wipe the data volume
```

The container is `episteme-postgres`; data persists in the `postgres_data` volume.
See `docker-compose.yml`.

---

## "Cannot connect to the Docker daemon" / Docker won't start

**Symptom.** Every `docker` command fails with:

```
Cannot connect to the Docker daemon at unix:///Users/<you>/.docker/run/docker.sock.
Is the docker daemon running?
```

…even though Docker Desktop looks like it's open.

**This is not a missing dependency.** In particular it is **not** an Xcode / Command
Line Tools problem — Docker Desktop ships its own Linux VM (Apple
Virtualization.framework / qemu) and does not need Xcode to bring up the daemon. CLT
only matter for *building* some native images, not for the engine starting.

**Root cause we hit (2026-06).** Docker Desktop's host backend
(`com.docker.backend`) **panicked and got wedged** — process still alive, but it had
**shut down all engines** (`stopping local engine linux/qemu … hyperkit … libkrun`),
so the daemon socket served nothing and never recovered. The panic was in Docker
Desktop's own telemetry/analytics cache (`internal/analytics/data/cache.go`), and it
lined up exactly with a **host disk-full event** (the volume hit 99%). A torn write
to that cache under disk pressure corrupted it; the next read panicked and tore the
engines down. Freeing disk afterward does **not** auto-repair the wedged state.

### Diagnose

```bash
docker info                                   # confirms the daemon is unreachable
pgrep -fl com.docker | grep -v vmnetd         # is com.docker.backend alive but stuck?
df -h /                                        # is/was the host disk near full?

# Docker Desktop's own logs — look for "panic(" and "stopping local engine":
LOGDIR=~/Library/Containers/com.docker.docker/Data/log/host
tail -200 "$LOGDIR/com.docker.backend.log" | grep -iE "panic|error|stopping local engine|no space"
```

### Fix

A plain quit-and-relaunch often **does not work**: the wedged backend ignores
`SIGTERM`, so `pkill -f Docker` reports success but the zombie survives, and
`open -a Docker` just reattaches to it. You have to **hard-kill** it:

```bash
# 1. Force-kill the stuck backend (kill -9; a user process, no sudo needed).
#    Leave the privileged helper com.docker.vmnetd alone.
pkill -9 -f '/Applications/Docker.app'

# 2. Confirm nothing's left (besides vmnetd):
pgrep -fl com.docker | grep -v vmnetd        # should print nothing

# 3. Relaunch fresh and wait for the VM to boot (~15–60s):
open -a Docker
until docker info >/dev/null 2>&1; do sleep 3; done
docker info --format 'engine {{.ServerVersion}}, running {{.ContainersRunning}}'
```

This is **non-destructive** — named volumes (incl. `postgres_data`) survive, and the
`episteme-postgres` container comes back on its own (`restart: unless-stopped`).

### Prevent

- **Watch host disk free space.** Docker's VM image + build layers are space-hungry;
  running the disk near-full is what corrupted the cache. `docker system prune` and
  removing unused volumes reclaims space.
- If Docker ever wedges again, go straight to the `kill -9` + relaunch above rather
  than fighting the UI.
