#!/usr/bin/env bash
# Smoke-tests a packaged LockScope: starts the desktop app without a window, checks that it serves
# the dashboard and the API, then runs a tiny forked benchmark with the packaged CLI (which proves
# the bundled Java runtime can start JMH forks).
#
#   scripts/smoke-desktop.sh <desktop launcher> <cli launcher>
set -euo pipefail

app="$1"
cli="$2"
base=http://127.0.0.1:8787
work="$(mktemp -d)"

"$app" --no-window >"$work/app.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; taskkill //F //IM LockScope.exe >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  if curl -fsS "$base/api/v1/health" >"$work/health.json" 2>/dev/null; then break; fi
  sleep 1
done
cat "$work/health.json"; echo
grep -q '"ok"' "$work/health.json"

curl -fsS -D "$work/headers.txt" "$base/" -o "$work/index.html"
grep -qi '^content-type: text/html' "$work/headers.txt"
grep -qi '^content-security-policy:' "$work/headers.txt"
grep -q '<div id="root">' "$work/index.html"
curl -fsS "$base/results/deep-link" | grep -q '<div id="root">'
echo "dashboard and API: ok"

"$cli" bench --profile lock-high-contention --algorithms tas,mcs --threads 1,2 --forks 1 \
  --wi 1 --wt 200 --mi 2 --mt 200 --no-gc --quiet --out "$work/bench.json"
grep -q '"lockscope.benchmark/v1"' "$work/bench.json"
echo "forked benchmark with the bundled runtime: ok"
