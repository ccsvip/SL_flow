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
#   2. Tails enough log to give a clear before/after picture.
#   3. Rebuilds backend + frontend images IN PLACE (no `docker compose down`,
#      so the database keeps running). Build failures DO NOT touch the
#      currently running containers - the old stack stays up.
#   4. Only swaps containers (`up -d`) once the build finishes cleanly.
#   5. Verifies /api/healthz returns 200 within 60 seconds; otherwise
#      prints the backend logs so you can diagnose.
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

# 2. Snapshot of state before we touch anything.
log "Current container state (BEFORE)"
docker compose ps || true

# 3. Build images first. If this fails, the running stack stays alive and we
#    abort with a non-zero exit code so the operator can read the build log.
log "Building backend image"
if ! docker compose build backend; then
    log "BUILD FAILED for backend - existing containers untouched"
    log "Last 40 lines of build context:"
    docker compose logs backend --tail=40 || true
    exit 1
fi

log "Building frontend image"
if ! docker compose build frontend; then
    log "BUILD FAILED for frontend - existing containers untouched"
    docker compose logs frontend --tail=40 || true
    exit 1
fi

# 4. Swap containers. `--remove-orphans` clears any stray container left over
#    from a half-finished prior update. Database container is unaffected.
log "Recreating containers with new images"
docker compose up -d --remove-orphans

# 5. Wait for backend to come up healthy.
log "Waiting for backend health check"
HEALTHY=0
for i in $(seq 1 30); do
    if curl -fsS http://localhost:8000/api/healthz >/dev/null 2>&1; then
        HEALTHY=1
        break
    fi
    sleep 2
done

log "Container state (AFTER)"
docker compose ps

if [[ "$HEALTHY" != "1" ]]; then
    log "Backend did NOT come up within 60s"
    log "Last 80 lines of backend log:"
    docker compose logs backend --tail=80
    log "Recent update log (if any):"
    tail -n 100 "$REPO_DIR/.last_update.log" 2>/dev/null || echo "(no .last_update.log)"
    exit 2
fi

log "Backend healthy: GET /api/healthz returned 200"
log "Frontend should be reachable at http://<host>:8080"
log "Recovery complete."
