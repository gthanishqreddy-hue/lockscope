# LockScope

[![CI](https://github.com/gthanishqreddy-hue/lockscope/actions/workflows/ci.yml/badge.svg)](https://github.com/gthanishqreddy-hue/lockscope/actions/workflows/ci.yml)
[![Deploy](https://github.com/gthanishqreddy-hue/lockscope/actions/workflows/pages.yml/badge.svg)](https://github.com/gthanishqreddy-hue/lockscope/actions/workflows/pages.yml)

**Understand concurrency. Prove correctness. Measure performance.**

**Live dashboard:** https://gthanishqreddy-hue.github.io/lockscope/ (static demo with the bundled
measurements; run the engine locally to start new experiments)

LockScope is a concurrent-systems performance lab: textbook locks and concurrent linked lists
implemented in Java, a correctness harness that tries to break them (and proves it can, with
negative controls), JMH benchmarks with honest statistics, and a dashboard to explore the evidence.

- **Engine (Java 17+):** TAS, TTAS, exponential backoff, CLH and MCS locks plus `ReentrantLock`
  baselines; coarse-grained, fine-grained, optimistic, lazy and lock-free (Harris–Michael) sets.
- **Correctness:** lost-update and overlap checks for locks; partitioned reference model,
  conservation and bounded linearizability checks for sets; seed-reproducible JSON reports;
  jcstress Java Memory Model tests for every lock, run in CI on x64 and ARM64.
- **Benchmarks:** JMH throughput or latency sampling, thread sweeps, 99.9% confidence intervals,
  allocation per operation, speedup and efficiency, JSON + CSV export.
- **Dashboard (React + TypeScript):** 10 pages, works as a free static site from bundled measured
  datasets and imported files; connects to the local engine to run new experiments.

Nothing in the dashboard pretends to be live: every dataset is labelled *Bundled sample*,
*Imported file* or *Local engine run*, theory is labelled *Theory*, and browser models are labelled
*Browser simulation*.

## Architecture

```text
engine/core    locks, sets, correctness harness (no dependencies)
   ▲  ▲
   │  └─ engine/jcstress  Java Memory Model tests for every lock
   │
engine/bench   JMH benchmarks, services, result schema, `lockscope` CLI ──► benchmark-results/*.json
   ▲
engine/server  local API on 127.0.0.1:8787 (JDK HTTP server)
   ▲  fetch (optional)                                              │ import / bundle
frontend       static React dashboard (Vercel, any static host, or localhost) ◄─┘
```

Details: [docs/architecture.md](docs/architecture.md).

## Prerequisites

- JDK 17 or newer (Gradle is downloaded by the wrapper)
- Node.js 20.19+ or 22+
- `scripts/dev-check` reports what is missing.

## Quick start

```bash
# 1. Engine: build and run all tests (about 1-2 minutes)
cd engine
./gradlew build

# 2. Correctness suite and a benchmark from the command line
./gradlew :bench:run --args="stress --target locks"
./gradlew :bench:run --args="bench --profile lock-high-contention --threads 1,2,4"

# 3. Local API for the dashboard (keep running)
./gradlew :server:run

# 4. Dashboard (second terminal)
cd frontend
npm ci
npm run dev          # http://localhost:5173
```

On Windows use `gradlew.bat` from `cmd`/PowerShell, or Git Bash for the commands as written.

## Commands

| Task | Command |
|---|---|
| Engine build + tests | `cd engine && ./gradlew build` |
| Heavier stress tier | `./gradlew test -Plockscope.stress=heavy` |
| jcstress (JMM) tests | `./gradlew :jcstress:jcstress [-Pjcstress.mode=tough]` |
| Correctness suite | `./gradlew :bench:run --args="stress --target locks\|sets [--runs N --seed S ...]"` |
| Benchmark | `./gradlew :bench:run --args="bench --profile NAME [--threads 1,2,4,8 --forks 2 ...]"` |
| List profiles | `./gradlew :bench:run --args="profiles"` |
| Local API | `./gradlew :server:run [--args="--port 8787 --allowed-origins ..."]` |
| Dashboard dev server | `cd frontend && npm run dev` |
| All frontend checks | `npm run check` (typecheck, lint, format check, tests, build) |
| Everything CI runs | `scripts/test-all` |
| Publish results to the dashboard | `node scripts/export-results.mjs benchmark-results/local/<id>.json` |
| Regenerate bundled samples | `scripts/generate-sample-data.sh` (about 30 min, idle machine) |

CLI output goes to `benchmark-results/local/` (relative to the repository root); every report
contains the command that reproduces it.

## Bundled measurements

`benchmark-results/sample/` holds real JMH and correctness runs, measured on the development machine
(Windows 11, 8 logical CPUs, Microsoft OpenJDK 17.0.20, JMH 1.37; see each file's `environment`).
They were taken on a laptop that was not otherwise idle, so treat them as illustrations; differences
smaller than the reported error bars are noise. Summary: see [Measured results](#measured-results).

## Measured results

All numbers below are JMH throughput in operations per microsecond (all threads combined) with
the 99.9% confidence-interval half-width, from `benchmark-results/sample/`. Same machine, same
settings within each table; 2 forks × 5 × 1 s measurement after 5 × 1 s warm-up.

**Locks, high contention** (`lock-high-contention`: 10 work tokens inside the lock, none outside)

| Lock | 1 thread | 2 threads | 4 threads | 8 threads |
|---|---|---|---|---|
| TAS | 38.6 ± 4.0 | 14.0 ± 1.5 | 8.1 ± 0.4 | 4.8 ± 0.6 |
| TTAS | 38.5 ± 8.4 | 17.5 ± 3.2 | 6.9 ± 0.1 | 4.0 ± 0.3 |
| Backoff | 34.8 ± 4.3 | 24.1 ± 1.6 | 8.5 ± 0.5 | 5.5 ± 0.7 |
| CLH | 22.3 ± 4.5 | 12.9 ± 0.5 | 9.5 ± 0.2 | 3.4 ± 3.1 |
| MCS | 27.9 ± 1.4 | 12.6 ± 2.6 | 6.9 ± 2.0 | 2.5 ± 2.3 |
| ReentrantLock | 44.2 ± 3.4 | 23.1 ± 3.4 | 29.7 ± 1.4 | 30.6 ± 3.4 |
| ReentrantLock (fair) | 39.3 ± 3.8 | 0.55 ± 0.43 | 0.16 ± 0.02 | 0.14 ± 0.03 |

What this run shows, and only for this machine and workload: every lock loses throughput as
contention grows, as expected for a serial critical section. Non-fair `ReentrantLock` held up
best from 4 threads on, plausibly because barging lets the releasing thread re-acquire while it
is still hot in cache. Fairness was very expensive (about 200× slower at 8 threads), since every
hand-off goes through park/unpark. At 8 threads the queue locks were the least stable (CLH ±3.1,
MCS ±2.3), which is consistent with the convoy effect described in
[docs/algorithms.md](docs/algorithms.md). Differences inside the error bars, such as TAS versus
TTAS at 8 threads, are not established.

**Concurrent sets, read-heavy** (`set-read-heavy`: 1024 keys, 90% `contains`)

| Set | 1 thread | 2 threads | 4 threads | 8 threads |
|---|---|---|---|---|
| Coarse | 1.57 ± 0.24 | 0.73 ± 0.07 | 0.78 ± 0.05 | 0.74 ± 0.08 |
| Fine-grained | 0.25 ± 0.01 | 0.37 ± 0.04 | 0.34 ± 0.16 | 0.23 ± 0.04 |
| Optimistic | 0.53 ± 0.09 | 0.79 ± 0.16 | 1.59 ± 0.23 | 2.35 ± 0.24 |
| Lazy | 1.04 ± 0.15 | 2.04 ± 0.11 | 3.59 ± 0.30 | 5.69 ± 0.46 |
| Lock-free | 0.53 ± 0.01 | 0.91 ± 0.08 | 1.71 ± 0.15 | 2.65 ± 0.53 |

The lazy list scaled best here (5.5× from 1 to 8 threads, wait-free `contains`). Fine-grained
locking was slowest throughout (two lock operations per node visited). The lock-free list paid for
allocation (about 6 bytes/op versus 2 for lazy, from `AtomicMarkableReference` pairs). The
balanced (50% reads) dataset shows the same ordering at lower absolute numbers.

**Correctness suites** (`correctness-*.json`): locks 42/42 checks passed with all 6 negative-control
runs caught; sets 45/45 passed (partitioned reference, conservation, 300 bounded-linearizability
histories per run), 8 threads, 3 seeds.

## Deployment (free)

The dashboard is deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.
Vercel (`frontend/vercel.json`) and Cloudflare Pages (`frontend/public/_redirects`, `_headers`)
configurations are included as alternatives. The engine always runs locally. Step-by-step
instructions and troubleshooting: [docs/deployment.md](docs/deployment.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Algorithms](docs/algorithms.md): design, memory ordering, guarantees, limitations, tests
- [Correctness testing](docs/correctness.md): checks, checker limits, reproducibility
- [Benchmarking](docs/benchmarking.md): method, metrics, interpretation, threats to validity
- [Local API](docs/api.md)
- [Deployment](docs/deployment.md), [Troubleshooting](docs/troubleshooting.md)
- [Decision records](docs/decisions/), [Security](SECURITY.md), [Contributing](CONTRIBUTING.md)

## Limitations

- Correctness checks and jcstress sample executions (x86 locally, x64 and ARM64 in CI); they are
  strong evidence, not a proof.
- The linearizability checker verifies short bounded histories of add/remove/contains only.
- Benchmarks reflect one machine, JDK and moment; no statistical significance is claimed.
- Locks are not reentrant, interruptible or timed (by design; documented per lock).
- The local API has no authentication and keeps experiments in memory only.
- Browser simulations (Execution Visualizer, Data Structure Lab stepper) model algorithm steps with
  sequentially consistent memory; they are teaching aids, not the Java engine.

## License

MIT, see [LICENSE](LICENSE).
