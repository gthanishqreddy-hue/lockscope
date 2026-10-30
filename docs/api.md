# Local engine API

Start it from the repository root:

```bash
cd engine && ./gradlew :server:run
# options: --args="--port 8787 --allowed-origins http://localhost:5173,https://your-site.pages.dev"
```

Base URL `http://127.0.0.1:8787/api/v1`. The server binds to the loopback interface only, has no
authentication, and is intended for one developer on their own machine (see
[SECURITY.md](../SECURITY.md)).

## Conventions

- JSON in and out (`Content-Type: application/json`); bodies are limited to 64 KB; unknown fields
  are rejected.
- Errors: `{"error": {"code": "invalid_request", "message": "threads must be in [1, 32] on this machine, got 100000"}}`.
- Status codes: 200 OK, 202 Accepted, 204 (preflight), 400 invalid input, 403 origin not allowed,
  404 not found, 405 wrong method, 409 conflict, 413 body too large, 415 not JSON, 421 Host header
  is not loopback, 429 queue full, 500 internal error.
- CORS: only the configured origins (default: `http://localhost:5173`, `http://127.0.0.1:5173`,
  `http://localhost:4173`, `http://127.0.0.1:4173`). Requests with any other `Origin` get 403.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{status, version, uptimeSeconds}` |
| GET | `/capabilities` | limits, queue state, environment (Java, OS, CPUs), workload profiles with defaults |
| GET | `/algorithms` | locks and sets with id, name, category and declared properties |
| POST | `/experiments` | start a benchmark or correctness experiment → 202 with the experiment |
| GET | `/experiments` | all experiments, newest first, without results |
| GET | `/experiments/{id}` | one experiment, including `result` once finished |
| POST | `/experiments/{id}/cancel` | request cancellation → 202, or 409 if already finished |
| GET | `/experiments/{id}/export?format=json\|csv` | download the result (CSV for benchmarks only) |

The prompt's separate `/tests` and `/results` routes are folded into experiments: a correctness
run is an experiment of type `correctness`, and its result is the experiment's `result`, so one
lifecycle, one queue and one export path serve both.

### Create a benchmark

```json
{
  "type": "benchmark",
  "benchmark": {
    "profile": "lock-high-contention",
    "algorithms": ["tas", "ttas", "mcs"],
    "threadCounts": [1, 2, 4, 8],
    "mode": "thrpt",
    "forks": 2,
    "warmupIterations": 5, "warmupMillis": 1000,
    "measurementIterations": 5, "measurementMillis": 1000,
    "gcProfiler": true
  }
}
```

`kind` (`lock`/`set`) is required when no profile is given. Lock fields: `criticalWork`,
`nonCriticalWork`; set fields: `keyRange`, `readPercent`. Omitted fields come from the profile.
Limits: threads 1–max(4, 4×CPUs) (≤ 256), forks 0–5, iterations ≤ 50, iteration time 100–10,000 ms,
estimated duration ≤ 4 h. The negative-control lock cannot be benchmarked.

### Create a correctness run

```json
{
  "type": "correctness",
  "correctness": {
    "target": "sets",
    "algorithms": ["lazy", "lockfree"],
    "threads": 8, "operationsPerThread": 50000, "runs": 3, "seed": 42,
    "keyRange": 256, "readPercent": 50, "linearizabilityHistories": 300
  }
}
```

API limits: runs ≤ 20, timeout ≤ 10 minutes per check, threads ≤ the benchmark thread limit.

### Experiment object

```json
{
  "id": "bench-20261030T101500Z-3fa2c1",
  "type": "BENCHMARK",
  "status": "RUNNING",
  "createdAt": "…", "startedAt": "…", "finishedAt": null,
  "completedSteps": 3, "totalSteps": 12,
  "currentStep": "mcs @ 4 threads",
  "error": null, "cancelRequested": false,
  "request": { … }, "result": null
}
```

`completedSteps`/`totalSteps` count benchmark points or correctness checks actually finished.

## Execution model

- One worker thread runs experiments **one at a time**, so experiments never compete for CPUs.
  Up to 4 more wait in a queue; beyond that, 429.
- Benchmarks never run inside an HTTP request thread.
- Cancellation takes effect between benchmark points or between correctness checks (a running JMH
  fork is not interrupted). The partial result is kept and marked cancelled.
- The registry keeps the 50 most recent experiments **in memory**; they are lost on restart.
- JMH holds a machine-wide lock file: running a CLI benchmark at the same time makes the server's
  benchmark fail with a clear error.

## Result schemas

`lockscope.benchmark/v1` and `lockscope.correctness/v1`, defined in
`engine/bench/src/main/java/io/lockscope/bench/model/` and mirrored with runtime validation in
`frontend/src/schemas/results.ts`.
