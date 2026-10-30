# Benchmark results

- `sample/`: measured result files bundled with the dashboard (copied to
  `frontend/public/data/` by `scripts/export-results.mjs`). They were produced by
  `scripts/generate-sample-data.sh` on one developer machine; each file records its environment
  (OS, CPUs, JDK, JMH) and exact methodology. They are real measurements, not synthetic data, and
  they are illustrations, not reference numbers for other machines.
- `local/`: where the CLI writes your own runs by default. Ignored by git.

File formats: `lockscope.benchmark/v1` (+ a CSV with one row per measurement) and
`lockscope.correctness/v1`. See `docs/api.md` and `docs/benchmarking.md`.
