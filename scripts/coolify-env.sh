#!/usr/bin/env bash
# coolify-env.sh — drive the production Coolify app (moreska.eu) from one place.
#
# Sufler's `scripts/coolify-env.sh` (~/projects/business/sufler/app), copied
# here per the kickstart RETROFIT (#703) with this app's uuid and its health
# path; it moves to ~/.agents as a shared tool once three repos carry it. What
# it is for is the Rollback section of docs/agents/deployment.md: find the last
# good commit, put its image back, read the health body.
#
# SECRETS
# The three deploy secrets (COOLIFY_TOKEN, CF_ACCESS_CLIENT_ID,
# CF_ACCESS_CLIENT_SECRET) live in Bitwarden Secrets Manager, project `coolify`,
# and never on disk (#710, spec: ~/.agents/specs/secrets.md). When COOLIFY_TOKEN
# is not in the environment, this script re-executes itself under `bws run`
# through ~/.agents/bin/with-secrets, so the secrets exist only inside that one
# process. The call does not change: `scripts/coolify-env.sh health`. A missing
# wrapper or project is named in the error, and ~/.agents/scripts/secrets-setup.sh
# sets it up. `help`, `health` (a public URL) and `app-uuid` (a constant) need no
# secret and answer before the re-exec, so reading prod's health body during a
# rollback never waits on Bitwarden.
#
# Everything else the script needs is not secret and is a constant below; the
# environment overrides any of them for a one-off run. The one override in use
# is the control plane over the `ssh coolify` tunnel:
#
#     COOLIFY_BASE_URL=http://localhost:8000 scripts/coolify-env.sh version
#
# The Cloudflare Access headers go only to the control plane behind Access:
# never to a base URL whose host is localhost or 127.0.0.1, even though the
# wrapper still injects the two CF_ACCESS_* keys into the process.
#
# The app uuid is PRODUCTION (`zek88q652dijih0ywodgffux`, the app
# docs/agents/deployment.md names). It is a constant and never resolved from the
# domain: staging is `dev.moreska.eu`, which contains `moreska.eu`, so a domain
# match could pick the wrong app — and that same Coolify also hosts an unrelated
# `korcula-pms`.
#
# USAGE
#   scripts/coolify-env.sh health                 # curl https://moreska.eu/api/health
#   scripts/coolify-env.sh app-uuid               # the uuid every other command targets
#   scripts/coolify-env.sh settings               # health check settings (read-only)
#   scripts/coolify-env.sh env-get                # list env KEYS on the app (no values)
#   scripts/coolify-env.sh env-set KEY VALUE      # set/update one env var
#   scripts/coolify-env.sh env-set-file KEY PATH  # set env var value from a file
#   scripts/coolify-env.sh redeploy               # deploy the tip of main again (no new commit)
#   scripts/coolify-env.sh healthcheck-host [HOST]  # print / set Coolify's health check host
#   scripts/coolify-env.sh version                # Coolify version (read-only)
#   scripts/coolify-env.sh deployments            # last 10 deployments: status, commit, time (read-only)
#   scripts/coolify-env.sh rollback-images        # images on the server you can roll back to (read-only)
#   scripts/coolify-env.sh rollback COMMIT        # redeploy the image built from COMMIT (no rebuild)
#
# Every mutating call prints what it does. Add DRY_RUN=1 to print without sending.
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }

# Non-secret config of the one production deployment (see the header).
COOLIFY_BASE_URL="${COOLIFY_BASE_URL:-https://coolify.josip-ivancevic.from.hr}"
COOLIFY_APP_UUID="${COOLIFY_APP_UUID:-zek88q652dijih0ywodgffux}"
APP_DOMAIN="${APP_DOMAIN:-moreska.eu}"
HEALTH_PATH="/api/health"

# curl wrapper: Coolify bearer, plus the CF Access headers when the control
# plane sits behind Cloudflare Access. The `ssh coolify` tunnel (a localhost
# base URL) has no Access in front, so the service token is not sent there.
# Args: METHOD PATH [curl-args…]
api() {
  local method="$1" path="$2"; shift 2
  local -a cf=()
  case "$COOLIFY_BASE_URL" in
    *://localhost|*://localhost:*|*://127.0.0.1|*://127.0.0.1:*) ;;
    *) if [ -n "${CF_ACCESS_CLIENT_ID:-}" ]; then
         cf=(-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET:?CF_ACCESS_CLIENT_SECRET is not set}")
       fi ;;
  esac
  curl -sS -m 40 -X "$method" \
    -H "Authorization: Bearer $COOLIFY_TOKEN" \
    ${cf[@]+"${cf[@]}"} \
    -H "Content-Type: application/json" \
    "$@" "$COOLIFY_BASE_URL$path"
}

# Like `api`, but fails on any non-2xx status instead of handing the error body
# on as if it were data. A 404 usually means the server's Coolify predates the
# endpoint (the rollback API arrived in 4.3.23).
api_ok() {
  local method="$1" path="$2" out code; shift 2
  out="$(api "$method" "$path" -w '\n%{http_code}' "$@")"
  code="${out##*$'\n'}"; out="${out%$'\n'*}"
  case "$code" in
    2??) printf '%s' "$out" ;;
    404) die "Coolify $(api GET /api/v1/version) -> HTTP 404 on $method $path: $out (rollback needs 4.3.23+, see docs/agents/deployment.md, Rollback)" ;;
    *)   die "Coolify $method $path -> HTTP $code: $out" ;;
  esac
}

# Prints the body too: its `commit` is the short sha the answering container
# was built from (SOURCE_COMMIT), so this is how you see that a deploy or a
# rollback took.
cmd_health() {
  local out code body
  out="$(curl -sS -m 20 -w '\n%{http_code}' "https://$APP_DOMAIN$HEALTH_PATH" || true)"
  code="${out##*$'\n'}"; body="${out%$'\n'*}"
  echo "https://$APP_DOMAIN$HEALTH_PATH → HTTP $code${body:+ $body}"
}

cmd_app_uuid() { echo "$COOLIFY_APP_UUID"; }

# The settings the shipping runbook depends on, read back rather than trusted:
# the health check (this app's probe is the Dockerfile HEALTHCHECK, ADR-0026
# alternative 7, so `custom_healthcheck_found` is what matters here). NOT
# `docker_images_to_keep`: Coolify 4.5.0 keeps it in `application_settings`
# and never returns it here (it read `null` while the box held 5, #707), so
# printing it would say "unset" about a value that is set. The Rollback tab
# in the UI has the number; `rollback-images` lists what is actually kept.
cmd_settings() {
  api_ok GET "/api/v1/applications/$COOLIFY_APP_UUID" | jq '{
    name, fqdn, git_branch, build_pack,
    health_check_enabled, health_check_host, health_check_path, health_check_port,
    custom_healthcheck_found
  }'
}

cmd_env_get() {
  api GET "/api/v1/applications/$COOLIFY_APP_UUID/envs" | jq -r '.[].key' | sort
}

# Set one env var (upsert). Uses bulk PATCH (create-or-update by key).
env_upsert() {
  local key="$1" value="$2"
  local body; body="$(jq -n --arg k "$key" --arg v "$value" \
    '{data:[{key:$k,value:$v,is_preview:false,is_build_time:false}]}')"
  if [ "${DRY_RUN:-0}" = 1 ]; then echo "[DRY_RUN] PATCH envs/bulk key=$key (${#value} chars)"; return; fi
  api PATCH "/api/v1/applications/$COOLIFY_APP_UUID/envs/bulk" -d "$body" >/dev/null
  echo "  set $key (${#value} chars) — takes effect on the next deploy"
}

cmd_env_set() {
  [ $# -eq 2 ] || die "env-set needs: KEY VALUE"
  env_upsert "$1" "$2"
}

cmd_env_set_file() {
  [ $# -eq 2 ] || die "env-set-file needs: KEY PATH"
  [ -f "$2" ] || die "No such file: $2"
  env_upsert "$1" "$(cat "$2")"
}

# POST: Coolify 4.2+ answers a GET on /deploy with 405; 4.1 took both.
cmd_redeploy() {
  if [ "${DRY_RUN:-0}" = 1 ]; then echo "[DRY_RUN] deploy uuid=$COOLIFY_APP_UUID"; return; fi
  api POST "/api/v1/deploy?uuid=$COOLIFY_APP_UUID&force=false" | jq -r '.deployments[0].message // "deploy queued"' 2>/dev/null \
    || echo "deploy queued"
}

# Coolify's own HTTP health check host. Kept from Sufler (#280: inside a
# container `localhost` resolves to ::1 first and Next listens on IPv4 only, so
# the default fails every check). Here the probe is the image's own HEALTHCHECK
# and Coolify's HTTP check is OFF by decision (ADR-0026, alternative 7: the
# runtime image has neither curl nor wget for Coolify's generated probe), so
# this is a read-back tool first; setting it does not turn the check on.
cmd_healthcheck_host() {
  [ $# -le 1 ] || die "healthcheck-host takes at most one argument: HOST"
  if [ $# -eq 1 ]; then [ -n "$1" ] || die "healthcheck-host: HOST is empty"; fi
  local body host
  if [ $# -eq 0 ]; then
    body="$(api_ok GET "/api/v1/applications/$COOLIFY_APP_UUID")"
    host="$(printf '%s' "$body" | jq -r '.health_check_host // empty')"
    [ -n "$host" ] || die "Coolify returned no health_check_host for app $COOLIFY_APP_UUID"
    echo "$host"
    return
  fi
  if [ "${DRY_RUN:-0}" = 1 ]; then echo "[DRY_RUN] PATCH uuid=$COOLIFY_APP_UUID health_check_host=$1"; return; fi
  api_ok PATCH "/api/v1/applications/$COOLIFY_APP_UUID" -d "$(jq -n --arg h "$1" '{health_check_host:$h}')" >/dev/null
  echo "  health_check_host = $1 (takes effect on the next deploy: scripts/coolify-env.sh redeploy)"
}

cmd_version() { api GET /api/v1/version; echo; }

# Last 10 deployments, newest first: status, commit, created, finished. The
# newest `finished` row before a bad one is the commit to roll back to.
cmd_deployments() {
  api GET "/api/v1/deployments/applications/$COOLIFY_APP_UUID?take=10" \
    | jq -r '(.deployments // .)[] | "\(.status)\t\(.commit // "-")\t\(.created_at)\t\(.finished_at // .updated_at // "-")"'
}

# Images Coolify still keeps on the server. Each tag is the commit sha it was
# built from; `rollback` only works for a tag listed here.
cmd_rollback_images() {
  local body
  body="$(api_ok GET "/api/v1/applications/$COOLIFY_APP_UUID/rollback-images")"
  printf '%s' "$body" \
    | jq -r '.images[] | "\(.tag)\t\(.created_at)\(if .is_current then "\t(current)" else "" end)"'
}

# Queue a deployment of an image that is already on the server. Nothing is
# rebuilt and git is untouched: main still holds the bad commit, so the next
# merge deploys over the rollback. Follow up with a revert PR, always.
cmd_rollback() {
  [ $# -eq 1 ] || die "rollback needs: COMMIT (see rollback-images)"
  local body
  if [ "${DRY_RUN:-0}" = 1 ]; then echo "[DRY_RUN] rollback uuid=$COOLIFY_APP_UUID commit=$1"; return; fi
  body="$(api_ok POST "/api/v1/applications/$COOLIFY_APP_UUID/rollback" -d "$(jq -n --arg c "$1" '{commit:$c}')")"
  printf '%s' "$body" | jq -r '.message // .'
}

# The commands that need no secret answer first: help prints the header block
# above (the title line down to the DRY_RUN line), health reads a public URL,
# app-uuid echoes a constant.
case "${1:-help}" in
  help|-h|--help)   sed -n '2,/^set -euo pipefail$/p' "$0" | sed '$d'; exit 0 ;;
  health)           shift; cmd_health "$@"; exit 0 ;;
  app-uuid)         shift; cmd_app_uuid "$@"; exit 0 ;;
esac

# Re-exec under bws when the secrets are not in the environment. WITH_SECRETS=1
# marks the second run: no token then means the project lacks the key, so fail
# instead of looping. A missing wrapper is named, not left to bash's "No such
# file or directory".
if [ -z "${COOLIFY_TOKEN:-}" ]; then
  wrapper="${AGENTS_DIR:-$HOME/.agents}/bin/with-secrets"
  [ "${WITH_SECRETS:-}" = 1 ] && die "COOLIFY_TOKEN is not in Secrets Manager project coolify; add it with ~/.agents/scripts/secrets-setup.sh (spec: ~/.agents/specs/secrets.md)"
  [ -x "$wrapper" ] || die "no $wrapper: clone jivancevic/agents to ~/.agents (or set AGENTS_DIR), then run ~/.agents/scripts/secrets-setup.sh (spec: ~/.agents/specs/secrets.md)"
  exec "$wrapper" coolify -- "$0" "$@"
fi

case "$1" in
  settings)         shift; cmd_settings "$@" ;;
  env-get)          shift; cmd_env_get "$@" ;;
  env-set)          shift; cmd_env_set "$@" ;;
  env-set-file)     shift; cmd_env_set_file "$@" ;;
  redeploy)         shift; cmd_redeploy "$@" ;;
  healthcheck-host) shift; cmd_healthcheck_host "$@" ;;
  version)          shift; cmd_version "$@" ;;
  deployments)      shift; cmd_deployments "$@" ;;
  rollback-images)  shift; cmd_rollback_images "$@" ;;
  rollback)         shift; cmd_rollback "$@" ;;
  *) die "Unknown command: $1 (try: help)" ;;
esac
