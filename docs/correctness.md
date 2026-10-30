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

Detection power depends on real parallelism and run length. On a machine with few cores, a very
small workload can let each thread finish before the others start, so even the no-op lock shows no
race; the suite then reports the control as **missed** and exits with code 1 rather than hiding it.
Use at least about 100,000 operations per thread and some critical-section work (the defaults do).

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

## jcstress: Java Memory Model tests

`engine/jcstress` holds [jcstress](https://github.com/openjdk/jcstress) tests for every lock. jcstress
runs each test millions of times across JIT compilation modes and scheduling strategies and
reports every outcome it observed.

| Test | Actors | Forbidden outcome |
|---|---|---|
| `<Lock>Increment` | two threads increment a plain `int` under the lock | `1` (a lost update) |
| `<Lock>Visibility` | one thread writes `x = 1; y = 1` under the lock, the other reads `y, x` under the lock | `1, 0` or `0, 1` (a torn or reordered view) |

The `NoLock` versions mark those outcomes *acceptable-interesting* instead of forbidden, and the
report shows that jcstress observes them.

Every concurrent set has five more tests (`<Set><Test>`), each a race where a broken implementation
misbehaves visibly:

| Test | Race | Only allowed results |
|---|---|---|
| `SameKeyAdd` | two threads `add(1)` on an empty set | exactly one succeeds |
| `SameKeyRemove` | two threads `remove(1)` on `{1}` | exactly one succeeds |
| `AddRemove` | `add(1)` races `remove(1)`, then `contains(1)` | one of the two serial orders |
| `AdjacentAdd` | `add(1)` and `add(2)` into the same gap | both succeed and both are present |
| `AdjacentRemove` | `remove(1)` and `remove(2)` on `{1, 2}` | both succeed and both are gone |

`UnsyncList*` runs the same tests on a list with no synchronization. In one local quick run jcstress
observed it lose inserts about 8.0 million times, resurrect a removed element 12.1 million times,
add a duplicate 11.3 million times and remove the same element twice 18.3 million times. It never
caught the control in `AddRemove`, so that test is the weakest of the five. None of the five real
sets produced a forbidden outcome, locally or in CI. Any forbidden outcome fails the Gradle task (verified with a
deliberately failing probe test).

```bash
cd engine
./gradlew :jcstress:jcstress                         # quick mode, about 5-10 minutes
./gradlew :jcstress:jcstress -Pjcstress.mode=tough   # much longer, more samples
./gradlew :jcstress:jcstress -Pjcstress.tests=Mcs    # only tests whose name matches
```

The HTML report is written to `engine/jcstress/build/reports/jcstress/`. CI runs jcstress and the
correctness suite on both **x64** and **ARM64** Linux (`memory-model` job), so the weaker ARM memory
model is exercised on every push.

## Threats to validity

- **Hardware memory model.** x86 is strongly ordered (TSO); a missing fence that the JMM requires
  may never show up on x86. CI therefore also runs jcstress and the suite on ARM64 Linux.
- **Sampling.** Stress tests and jcstress explore many but not all interleavings. Exhaustive
  model checking (e.g. of the algorithms in TLA+ or with a JMM model checker) is out of scope.
- **Timing.** The JIT may compile the harness differently from production code.
