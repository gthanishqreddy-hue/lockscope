# Architecture

LockScope has three parts with one-way dependencies:

```text
┌──────────────────────────── your computer ─────────────────────────────┐
│                                                                        │
│  engine/core     locks, concurrent sets, correctness harness           │
│     ▲            (no dependencies)                                     │
│     │                                                                  │
│  engine/bench    JMH benchmarks, BenchmarkService, CorrectnessService, │
│     ▲            result schema (JSON/CSV), `lockscope` CLI ──► files   │
│     │                                                    benchmark-    │
│  engine/server   local HTTP API on 127.0.0.1:8787        results/*.json│
│     ▲                                                          │       │
│     │ fetch (optional)                                         │import │
│  browser ── LockScope dashboard (React, static files) ◄────────┘       │
│                ▲                                                       │
└────────────────┼───────────────────────────────────────────────────────┘
                 │ static HTML/JS/JSON (bundled sample datasets)
          Cloudflare Pages (or any static host)
```

- **The concurrency library (`engine/core`) knows nothing about benchmarking, JSON or HTTP.**
  It contains `MutexLock` and its implementations, `ConcurrentSet` and its implementations, and the
  correctness harness (`LockChecks`, `SetChecks`, `SetLinearizabilityChecker`, `CorrectnessSuite`).
- **`engine/bench`** turns configurations into JMH runs (`BenchmarkService`) and correctness
  suites into reports (`CorrectnessService`), defines the result schema (`model/`), serializes it
  (`ResultIO`), and exposes everything through the `lockscope` CLI.
- **`engine/server`** is a thin HTTP layer over the same two services. It adds validation of
  untrusted input, a bounded queue, cancellation and an in-memory registry.
- **`frontend`** is a static single-page app. It always works from bundled datasets and imported
  files; when it finds a running engine it can also start experiments.

## Engine components

| Component | Responsibility |
|---|---|
| `lock.MutexLock`, `LockProperties` | Lock contract and declared guarantees |
| `lock.TasLock` … `McsLock` | Textbook locks; `AbstractOwnedLock` adds ownership checks |
| `lock.JdkReentrantLock` | Standard-library baseline |
| `lock.NoLock` | Negative control for the harness |
| `lock.LockType` | Registry: stable ids used in results and the API |
| `set.ConcurrentSet`, `SetProperties` | Set contract and declared guarantees |
| `set.CoarseList` … `LockFreeList` | Five synchronization strategies |
| `correctness.ConcurrentRunner` | Starts bounded worker threads behind a start gate, with a deadline |
| `correctness.LockChecks`, `SetChecks` | The checks (see [correctness.md](correctness.md)) |
| `correctness.CorrectnessSuite` | Runs checks for many algorithms and runs, with derived seeds |
| `bench.jmh.LockBenchmark`, `SetBenchmark` | JMH benchmark definitions |
| `bench.BenchmarkRequest` | Validated benchmark configuration with resource limits |
| `bench.BenchmarkService` | One JMH run per (algorithm, thread count) point → `BenchmarkReport` |
| `bench.ResultIO`, `model/*` | Schema `lockscope.benchmark/v1` and `lockscope.correctness/v1` |
| `bench.cli.LockScopeCli` | `stress`, `bench`, `profiles`, `env` commands |
| `server.ApiHandler` | Routing, CORS, Host check, validation, error mapping |
| `server.ExperimentManager` | Single worker thread, queue of 4, in-memory registry of 50 |

## Frontend components

| Area | Contents |
|---|---|
| `schemas/results.ts` | TypeScript mirror of the result schema and a strict validator used for every file |
| `services/` | Engine API client (timeouts, typed errors), bundled/imported dataset loading, storage guards |
| `app/` | Global state (theme, engine status, datasets, notifications), layout, routes |
| `components/` | Design-system primitives, ECharts wrapper, chart option builders, sortable table |
| `features/` | Reusable panels: scaling charts, experiment builders, progress, import |
| `pages/` | The ten pages |
| `sim/` | Browser simulations (lock step model, list step model), always labelled as such |
| `utils/` | Scaling math, comparability checks, CSV, formatting, form validation and CLI command generation |

## Data flow

1. **Measure.** `BenchmarkService` or `CorrectnessService` produce a report object.
2. **Persist.** The CLI writes it to `benchmark-results/local/<id>.json` (+ `.csv` for benchmarks).
   The API keeps it in memory and returns it.
3. **Publish (optional).** `scripts/export-results.mjs` copies chosen files into
   `frontend/public/data/`, sets `origin` to `bundled-sample` and rebuilds `index.json`.
4. **Display.** The dashboard loads bundled files, imported files (validated, stored in
   `localStorage`) and live engine results (stored the same way). Each dataset carries a
   `source` (`bundled-sample`, `imported-file`, `live-engine`) that every chart and table shows.

## Experiment lifecycle (API)

```text
POST /experiments ──► QUEUED ──► RUNNING ──► SUCCEEDED
                        │           │   └──► FAILED     (error message kept)
                        └─cancel──► │
                         CANCELLED ◄┘ (between points/checks; partial result kept)
```

Only one experiment runs at a time so measurements do not disturb each other. A full queue returns
HTTP 429.

## Error handling

- Invalid input fails fast in domain constructors (`BenchmarkRequest`, `CorrectnessSuite.Config`,
  `LockChecks.Config`, …) with readable `IllegalArgumentException` messages, which the CLI prints
  (exit 2) and the API returns as HTTP 400.
- Worker exceptions and timeouts inside checks become `ERROR` / `TIMEOUT` results, never silent
  passes.
- JMH failures become `BenchmarkFailedException` (CLI exit 3, API experiment `FAILED`).
- The frontend maps network failures, timeouts and API errors to `EngineError` with a specific
  message, and validates every result file before use.

## Storage and persistence decisions

- **No database.** Results are files; the dashboard needs none of them to start.
- **Engine registry in memory.** Restarting the server forgets experiments. The dashboard saves
  every finished result in the browser, and the API can export JSON/CSV.
- **Browser storage** is used only for theme, sidebar state, engine URL and the user's datasets
  (up to about 4 MB), with every access guarded so the app works when storage is unavailable.

See also the decision records in [decisions/](decisions/).
