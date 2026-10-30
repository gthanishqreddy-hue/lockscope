#!/usr/bin/env bash
# Regenerates the measured datasets in benchmark-results/sample/ (about 25-30 minutes).
# Run on an otherwise idle machine; then publish them to the dashboard with
#   node scripts/export-results.mjs benchmark-results/sample/*.json
set -euo pipefail
cd "$(dirname "$0")/../engine"
# :bench:run resolves paths from the repository root.
OUT=benchmark-results/sample
run() { ./gradlew -q :bench:run --args="$*"; }

run stress --target locks --algorithms all --threads 8 --ops 200000 --runs 3 --seed 42 --out $OUT/correctness-locks.json || true
run stress --target sets --algorithms all --threads 8 --ops 50000 --runs 3 --seed 42 --out $OUT/correctness-sets.json || true
run bench --profile lock-high-contention --threads 1,2,4,8 --quiet --out $OUT/locks-high-contention.json
run bench --profile set-balanced --threads 1,2,4,8 --quiet --out $OUT/sets-balanced.json
run bench --profile set-read-heavy --threads 1,2,4,8 --quiet --out $OUT/sets-read-heavy.json
run bench --profile lock-moderate-contention --algorithms tas,ttas,backoff,mcs,jdk-reentrant --threads 1,4,8 --mode sample --forks 1 --wi 3 --mi 5 --quiet --out $OUT/locks-latency-sample-mode.json
