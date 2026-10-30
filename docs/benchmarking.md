# Benchmarking

## Method

All performance numbers come from [JMH](https://github.com/openjdk/jmh) 1.37, driven
programmatically by `BenchmarkService`:

- **One JMH run per (algorithm, thread count) point**, each in its own forked JVM(s), so
  algorithms do not share JIT profiles. Default: 2 forks × (5 × 1 s warm-up + 5 × 1 s
  measurement).
- **Shared state** (`@State(Scope.Benchmark)`): all benchmark threads contend on one lock or one
  set. Per-thread random sources use `@State(Scope.Thread)`.
- **Dead-code elimination** is prevented by side effects (the lock benchmark increments a shared
  field; the set benchmark sinks results into a `Blackhole`).
- **Keys are pre-boxed** so the set benchmark does not measure `Integer` allocation.
- **Allocation** per operation comes from JMH's GC profiler (`gc.alloc.rate.norm`).
- **Forked JVM options:** `-Xms512m -Xmx1g`.

### Workloads

`LockBenchmark.acquireRelease`: `nonCriticalWork` tokens of private work, then lock, increment,
`criticalWork` tokens, unlock. Tokens are `Blackhole.consumeCPU` units (a few ns each; CPU-dependent).

`SetBenchmark.mixedOperation`: uniform keys in `[0, keyRange)`; `readPercent`% `contains`, the
rest split evenly between `add` and `remove`, so the set stays about half full (prefilled to half
with a fixed seed).

Profiles (`lockscope profiles`): `lock-high-contention` (cs 10, ncs 0), `lock-moderate-contention`
(10/200), `lock-low-contention` (10/2000), `lock-short-cs` (0/0), `lock-long-cs` (500/100),
`set-read-heavy` (1024 keys, 90% reads), `set-balanced` (50%), `set-write-heavy` (10%),
`set-small-high-contention` (64 keys, 50%), `set-large` (8192 keys, 90%). Default thread sweep:
powers of two up to the CPU count.

## Metrics

| Metric | Definition | Mode |
|---|---|---|
| Throughput | operations per µs, summed over all threads (JMH `Throughput`) | `thrpt` |
| Score error | half-width of the 99.9% confidence interval of the mean over all measurement iterations (Student's t, by JMH) | both |
| Iteration scores | every individual measurement-iteration score | both |
| Latency percentiles | p50, p90, p99, p99.9 from JMH `SampleTime` samples; `max` is a single observation | `sample` only |
| Allocation | bytes per operation (GC profiler) | both, if enabled |
| Speedup | `S(n) = T(1)/T(n) = X(n)/X(1)` for fixed work, where `X` is throughput | `thrpt`, needs a 1-thread point |
| Efficiency | `E(n) = S(n)/n`, shown as a percentage | `thrpt` |

Undefined values (no 1-thread baseline, zero or non-finite scores) are `null`, never 0. Throughput
mode does not record latency, so no percentiles are reported for it. Lock acquisition wait time and
queue wait time are **not** measured: instrumenting them would perturb the locks, so the product
does not claim them.

**A single contended lock is not expected to speed up.** Its critical section is serial; adding
threads adds hand-off cost. `S(n) < 1` for every lock under high contention is the expected result.
For sets, speedup above 1 is possible when operations can proceed in parallel.

## Reproducing

```bash
cd engine
./gradlew :bench:run --args="profiles"
./gradlew :bench:run --args="bench --profile lock-high-contention"
./gradlew :bench:run --args="bench --profile set-read-heavy --threads 1,2,4,8 --forks 3"
./gradlew :bench:run --args="bench --kind lock --algorithms tas,mcs --mode sample --threads 1,4"
```

Results go to `benchmark-results/local/<id>.json` and `.csv` (relative to the repository root).
Every report stores its own reproduce command. To publish a run as a bundled dashboard dataset:

```bash
node scripts/export-results.mjs benchmark-results/local/<id>.json
```

`scripts/generate-sample-data.sh` regenerates all bundled samples (about 30 minutes).

## Interpreting results

The dashboard (and `utils/scaling.ts`) only makes cautious statements:

- which algorithm had the highest measured throughput **in this workload**, or that the top two are
  **not distinguishable** when their 99.9% intervals overlap;
- whether throughput fell under contention or scaled sub-linearly;
- where variability exceeded ±10%;
- when points oversubscribe the CPUs.

No statistical significance is claimed: overlapping confidence intervals are not a hypothesis test,
and non-overlapping ones are evidence, not proof, of a difference.

**Compare only comparable runs.** The comparison page blocks overlays across different workloads,
modes or units, and warns about different machines, JDKs or measurement settings.

## Threats to validity

- **Shared or virtualized machines** (laptops with background apps, CI runners, cloud VMs) have
  noisy neighbours, frequency scaling and turbo boost. Close other programs; repeat runs; trust only
  differences larger than the error bars.
- **Oversubscription:** with more threads than CPUs, spin locks measure the OS scheduler.
- **Thermal and power state** change between points; points run sequentially, not interleaved.
- **Work tokens** are CPU-dependent; the same profile is a different workload on another CPU.
- **JDK version and GC** matter (allocation in the lock-free list in particular).
- **Windows timer and scheduler** behaviour differ from Linux; the bundled samples were measured on
  Windows 11 (see each file's `environment`).
- **Timer granularity:** sample-mode percentiles are quantized by `System.nanoTime` resolution;
  on the Windows development machine they come in 100 ns steps, so p50 values such as 400 ns mean
  "between about 400 and 500 ns".
- **Bundled samples were measured once** on one developer machine and are illustrations, not
  reference numbers.
