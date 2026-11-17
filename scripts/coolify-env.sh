#!/usr/bin/env bash
# coolify-env.sh: thin wrapper over the shared script in the ops repo.
#
# The script that drives Coolify for every app (env, deploys, rollback, health)
# lives in ~/projects/ops/bin/coolify (private repo jivancevic/ops); this repo
# used to carry its own copy and the copies drifted. The commands are the same
# as before, for the app `moreska`:
#   scripts/coolify-env.sh health | app-uuid | env-get | env-set KEY VALUE |
#   env-set-file KEY PATH | redeploy | healthcheck-host [HOST] | deployments |
#   rollback-images | rollback COMMIT | settings | version
# Secrets, constants and DRY_RUN are handled there; see its header and
# ~/projects/ops/RUNBOOK.md. Override the checkout with OPS_REPO.
set -euo pipefail

OPS_COOLIFY="${OPS_REPO:-$HOME/projects/ops}/bin/coolify"
[ -x "$OPS_COOLIFY" ] || { echo "ERROR: $OPS_COOLIFY not found; clone jivancevic/ops to ~/projects/ops" >&2; exit 1; }

case "${1:-help}" in
  # These take no app name.
  version|apps) exec "$OPS_COOLIFY" "$@" ;;
  help|-h|--help) exec "$OPS_COOLIFY" help ;;
esac
exec "$OPS_COOLIFY" moreska "$@"
