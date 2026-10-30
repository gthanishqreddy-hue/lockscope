# Correctness testing

LockScope separates **correctness evidence** from **performance**. Passing checks are evidence for
the tested configurations; they are not proofs, and the reports say so.

## Lock checks (`LockChecks`)

| Check | Critical section | Catches | Blind spot |
|---|---|---|---|
| `lock.lost-update` | `v = counter; work; counter = v + 1` on a **plain** `long`, nothing else | overlapping owners, and missing happens-before between owners (stale reads) | overlaps that happen not to lose an update |
| `lock.mutual-exclusion` | atomic occupancy counter `inside`; a violation if it is ≠ 1 on entry; plus the counter above | every overlap, directly; max simultaneous owners | its atomics are full fences that can mask a visibility bug, hence the other check |

The harness never serializes the critical section itself: workers wait at a start gate, then run
independently; the only synchronization inside the lost-update critical section is the lock.

## Set checks (`SetChecks`)

| Check | How | Valid because |
|---|---|---|
| `set.partitioned-reference` | Thread *t* only touches keys with `key % T == t`; every return value is compared with a per-thread sequential model while all threads share one list | no other thread touches a thread's keys, so each result is determined by that thread's own history |
| `set.conservation` | All threads hit a small shared key range; per key, `initial + successful adds − successful removes` must be 0 or 1 and equal final membership | holds for every linearizable set |
| `set.linearizability` | Hundreds of short histories (default 8 ops × threads on 3 keys), each recorded with a shared `AtomicLong` clock and searched exhaustively | see below |

Every set check also verifies the structural invariants (`checkInvariants()`), that `snapshot()`
equals the expected contents and that `size()` matches.

### Bounded linearizability checker

`SetLinearizabilityChecker` implements the Wing–Gong search with memoization of
(linearized-subset, state) pairs. An operation may be linearized next only if no pending operation
responded before it was invoked. Because each set operation touches one key and operations on
different keys commute, linearizability is checked **per key** (locality, Herlihy & Wing 1990).

Limits, stated in every report:

- at most 62 operations per key (64-bit mask); larger key histories are reported as
  **inconclusive**, never as passed (a run where every history is inconclusive fails);
- only `add`, `remove`, `contains`; `size()` and `snapshot()` are not checked;
- invoke/response ticks are taken just outside the call, so they bracket the real interval.

## Negative controls

A check that cannot fail proves nothing. Therefore:

- `NoLock` runs in every lock suite that includes it, and must fail both lock checks
  (`CAUGHT` in the CLI, "Control caught" in the dashboard).
- `UnsynchronizedList` (test-only) must be caught by the conservation and linearizability checks
  (`ConcurrentSetStressTest`), and the checker is unit-tested on hand-built histories with known
  answers (`SetLinearizabilityCheckerTest`).

## Reproducibility

Each `CheckResult` records check, algorithm, threads, operations, **seed**, status, failure
category, duration, metrics and up to 25 diagnostic lines (including the failing history for
linearizability failures). Run *r* of a suite uses seed `seed + r`. Every report carries the exact
command to rerun it:

```bash
cd engine && ./gradlew :bench:run --args="stress --target sets --algorithms lazy --threads 8 --ops 50000 --runs 1 --seed 43"
```

The seed reproduces the **workload**; the thread interleaving depends on the OS scheduler and is
not reproducible. Rerun failing seeds several times, and with more runs.

## Status and failure categories

`PASSED`, `FAILED`, `TIMEOUT`, `ERROR`, `CANCELLED`; categories `MUTUAL_EXCLUSION_VIOLATION`,
`LOST_UPDATE`, `INVARIANT_VIOLATION`, `REFERENCE_MISMATCH`, `CONSERVATION_VIOLATION`,
`NOT_LINEARIZABLE`, `INCONCLUSIVE`, `TIMEOUT`, `EXCEPTION`.

A timeout means workers did not finish before the deadline: possible deadlock, livelock or an
overloaded machine. Java cannot stop a thread stuck spinning in a broken lock; such workers are
daemon threads and die with the JVM.

## Running

```bash
cd engine
./gradlew test                         # unit + stress tests (standard tier)
./gradlew test -Plockscope.stress=heavy  # 10x iterations
./gradlew :bench:run --args="stress --target locks"   # CLI suite, writes a JSON report
./gradlew :bench:run --args="stress --target sets --runs 10 --lin-histories 2000"
```

CLI exit code 1 means a real algorithm failed or a negative control was missed.

## Threats to validity

- **Hardware memory model.** x86 is strongly ordered (TSO). A missing fence that the JMM requires
  may never show up on x86 but fail on ARM. Run the suite on ARM hardware (e.g. Apple Silicon or
  an ARM cloud VM) for stronger evidence.
- **Sampling.** Stress tests explore a tiny fraction of interleavings. Tools such as
  [jcstress](https://github.com/openjdk/jcstress) or model checkers explore more systematically;
  they are not part of this project (see the README's next steps).
- **Timing.** The JIT may compile the harness differently from production code.
