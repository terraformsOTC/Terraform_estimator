#!/usr/bin/env bash
# daily-refit.sh — refit the pricing model against the freshest sales, every 24h.
#
# WHY THIS EXISTS
# On 2026-09-23 every estimate on the site was running ~15% high. Nothing had
# broken: the coefficients were fitted on 2026-09-03 and the floor_calibration
# constant with them. Over the next three weeks the listing floor rose 20% while
# transacted prices stayed flat, so the ratio the constant encodes moved from 0.93
# to 0.77 — and nothing re-measured it. A plain parcel (#9322) was quoted 11.6%
# above floor, listed at floor, and sold 14% below it.
#
# A model fitted once and left alone does not stay correct; it decays quietly,
# because the inputs keep moving and nothing shouts. The fix is cadence.
#
# WHY IT RUNS HERE AND NOT ON RENDER
# The sales DB (~15MB SQLite, 20k sales) is deliberately never pushed — it is
# built from the OpenSea API with a key that stays on this machine. The fit also
# needs Python with numpy/scikit-learn. The deployed backend has none of that. So
# this machine is the only place a refit can happen; it commits the artifacts and
# pushes, and Render/Vercel deploy from that.
#
# ORDER MATTERS
#   1. sample the live floor      — calibrate-floor needs a live sample from TODAY,
#                                   or it refuses (CALIB_MAX_AGE_DAYS)
#   2. catchup + enrich           — the freshest sales, which is the whole point
#   3. build_floor_index          — the endogenous deflator the fit trains against
#   4. views + priors             — model_eligible, floor_at_sale, thin-trait priors
#   5. fit_hedonic.py             — writes pricing-v2-coeffs.json
#   6. calibrate-floor --write    — MUST be last: the fit overwrites the JSON that
#                                   holds floor_calibration
#   7. verify, then commit + push
#
# Failures stop the run and leave production on the last good coefficients. That is
# the right default: a stale-but-known model beats an unvalidated one.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SALES="$REPO/sales database"
ENV_FILE="$REPO/backend/.env"
LOG_DIR="$REPO/ops/logs"
LOCK_DIR="/tmp/terraforms-daily-refit.lock"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_DIR/daily-refit.log") 2>&1
echo "=============================================================="
echo "[refit] start $(date -u +%FT%TZ)"

# A refit takes minutes and the schedule is daily, but a machine asleep over
# several fire times can wake to a backlog. One at a time.
#
# mkdir, not flock: macOS ships no flock(1). mkdir is atomic on every filesystem
# that matters, and the PID file lets a run orphaned by a hard kill be cleared
# rather than blocking every future run.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [ -f "$LOCK_DIR/pid" ] && ! kill -0 "$(cat "$LOCK_DIR/pid")" 2>/dev/null; then
    echo "[refit] clearing stale lock from dead pid $(cat "$LOCK_DIR/pid")"
    rm -rf "$LOCK_DIR"; mkdir "$LOCK_DIR" 2>/dev/null || { echo "[refit] lock race — exiting"; exit 0; }
  else
    echo "[refit] another run holds the lock — exiting"; exit 0
  fi
fi
echo $$ > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT

fail() { echo "[refit] FAILED: $*"; exit 1; }

[ -f "$ENV_FILE" ] || fail "no backend/.env (needs ALCHEMY_API_KEY, OPENSEA_API_KEY)"
[ -f "$SALES/terraforms_sales.db" ] || fail "no sales DB at $SALES"
[ -x "$SALES/.venv/bin/python" ] || fail "no python venv at $SALES/.venv"

cd "$REPO"
# Refuse to run on top of someone's half-finished work: this script commits, and
# it must only ever commit the artifacts it regenerated.
if [ -n "$(git status --porcelain -- backend/src/pricing-v2-coeffs.json backend/src/floor-history.json 'sales database/v1-priors.json')" ]; then
  fail "pricing artifacts already modified in the working tree — resolve by hand first"
fi
git rev-parse --abbrev-ref HEAD | grep -qx main || fail "not on main"

echo "[refit] 1/7 sampling live floor"
node --env-file="$ENV_FILE" backend/scripts/append-floor-history.js || fail "floor sample"

cd "$SALES"
echo "[refit] 2/7 catchup + enrich"
node catchup.js      || fail "catchup"
node enrich_tokens.js || fail "enrich_tokens"
node enrich_usd.js   || fail "enrich_usd"

echo "[refit] 3/7 floor index"
node build_floor_index.js >/dev/null || fail "build_floor_index"

echo "[refit] 4/7 views + priors"
node -e "require('better-sqlite3')('terraforms_sales.db').exec(require('fs').readFileSync('views.sql','utf8'))" || fail "views"
node build_priors.js >/dev/null || fail "build_priors"

echo "[refit] 5/7 fit"
cp pricing-v2-coeffs.json pricing-v2-coeffs.prev.json 2>/dev/null || true
.venv/bin/python fit_hedonic.py || fail "fit_hedonic"

echo "[refit] 6/7 calibrate"
# Refuses on a stale day or an implausible jump — see calibrate-floor.js.
node calibrate-floor.js --write || fail "calibrate-floor (see reason above; production keeps the previous coefficients)"
cp pricing-v2-coeffs.json "$REPO/backend/src/pricing-v2-coeffs.json"

echo "[refit] 7/7 verify"
cd "$REPO"
node ops/verify-model.js || fail "verification (production keeps the previous coefficients)"

if [ -z "$(git status --porcelain -- backend/src/pricing-v2-coeffs.json backend/src/floor-history.json 'sales database/v1-priors.json')" ]; then
  echo "[refit] no artifact changed — nothing to ship"
  exit 0
fi

git add backend/src/pricing-v2-coeffs.json backend/src/floor-history.json "sales database/v1-priors.json"
git commit -q -m "model: daily refit $(date -u +%F)

Automated by ops/daily-refit.sh. Coefficients refitted against sales through
$(date -u +%F) and floor_calibration re-measured from today's index vs live floor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"

# The pre-push hook appends a floor sample and exits 1 asking for a re-push; the
# sample it wants is already in this commit, so the second push is the real one.
git push -q || git push -q || fail "push"
echo "[refit] pushed $(git rev-parse --short HEAD)"
echo "[refit] done $(date -u +%FT%TZ)"
