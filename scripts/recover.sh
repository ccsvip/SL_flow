#!/usr/bin/env bash
# SL Flow - emergency recovery / rebuild script.
#
# Run this on the server (as root) when:
#   * The "立即应用更新" button left the stack in a bad state (502, restarting
#     loop, or stuck "another update in progress").
#   * You manually changed code on disk and want to safely apply it.
#
# What this script does, in order:
#
#   1. Clears any leftover hot-update lock and orphan updater container so
#      future updates aren't blocked.
#   2. Pre-pulls the docker:27.5.1-cli image used by the hot-update sibling
#      so future updates aren't blocked by a slow Docker Hub.
#   3. Tails enough log to give a clear before/after picture.
#   4. Rebuilds backend + frontend images IN PLACE (no `docker compose down`,
#      so the database keeps running). Build failures DO NOT touch the
#      currently running containers - the old stack stays up.
#   5. Only swaps containers (`up -d`) once the build finishes cleanly.
#   6. Verifies /api/healthz returns 200 within 60 seconds. The probe runs
#      INSIDE the backend container (`docker exec slflow-backend curl ...`)
#      so it works regardless of any custom BACKEND_PORT mapping in .env.
#   7. On health failure, dumps the last 100 lines of backend log + the
#      hot-update log so the operator (or whoever they paste it to) has
#      enough context to diagnose without further SSH steps.
#
# Usage:
#   cd /root/workspace/SL_flow
#   sudo bash scripts/recover.sh
#
# Exit codes:
#   0 - stack is healthy
#   1 - build failed (running stack untouched)
#   2 - build OK, but backend never returned healthy (logs printed)

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_DIR"

log() {
    printf '\n=== %s ===\n' "$*"
}

log "Workspace: $REPO_DIR"

# 1. Clear stale lock + orphan updater so a future hot-update isn't blocked.
log "Clearing hot-update artifacts"
rm -f "$REPO_DIR/.update.lock" || true
docker rm -f slflow-updater >/dev/null 2>&1 || true

# 2. Pre-pull the hot-update sibling image so future "立即应用更新" clicks
#    aren't gated on a slow registry lookup. Best-effort - if Docker Hub
#    is unreachable, the local cache (if any) still works.
log "Pre-pulling docker:27.5.1-cli (used by hot-update sibling)"
docker pull docker:27.5.1-cli >/dev/null 2>&1 || \
    echo "(skipped: docker hub unreachable, will rely on local cache)"

# 3. Snapshot of state before we touch anything.
log "Current container state (BEFORE)"
docker compose ps || true

# 4. Build images first. If this fails, the running stack stays alive and we
#    abort with a non-zero exit code so the operator can read the build log.
log "Building backend image"
if ! docker compose build backend; then
    log "BUILD FAILED for backend - existing containers untouched"
    log "Last 40 lines of backend log:"
    docker compose logs backend --tail=40 || true
    exit 1
fi

log "Building frontend image"
if ! docker compose build frontend; then
    log "BUILD FAILED for frontend - existing containers untouched"
    docker compose logs frontend --tail=40 || true
    exit 1
fi

# 5. Swap containers. `--remove-orphans` clears any stray container left over
#    from a half-finished prior update (slflow-updater is started via plain
#    `docker run` without a compose-project label, so it's NOT affected).
#    The DB container is unaffected because its image hash didn't change.
log "Recreating containers with new images"
docker compose up -d --remove-orphans

# 6. Wait for backend to come up healthy. We probe INSIDE the container so
#    the result is independent of any custom BACKEND_PORT mapping in .env.
log "Waiting for backend health check (via docker exec, port-mapping-independent)"
HEALTHY=0
for i in $(seq 1 30); do
    if docker exec slflow-backend curl -fsS http://localhost:8000/api/healthz >/dev/null 2>&1; then
        HEALTHY=1
        break
    fi
    sleep 2
done

log "Container state (AFTER)"
docker compose ps

if [[ "$HEALTHY" != "1" ]]; then
    log "Backend did NOT come up within 60s"
    log "=== docker compose logs backend (last 100 lines) ==="
    docker compose logs backend --tail=100 || true
    log "=== .last_update.log (last 100 lines) ==="
    tail -n 100 "$REPO_DIR/.last_update.log" 2>/dev/null || echo "(no .last_update.log)"
    log "=== docker compose ps ==="
    docker compose ps || true
    log "Paste the output above to whoever is helping you debug."
    exit 2
fi

log "Backend healthy: GET /api/healthz returned 200 (probed via docker exec)"
log "Frontend should be reachable at http://<host>:8080"
log "Recovery complete."

