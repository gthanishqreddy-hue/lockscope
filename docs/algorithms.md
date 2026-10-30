# Algorithms

Everything here describes design-level guarantees. Measurements are in the result files; test
coverage is listed per algorithm. References: M. Herlihy, N. Shavit, V. Luchangco, M. Spear,
*The Art of Multiprocessor Programming* (2nd ed.), chapters 7 and 9; JLS chapter 17.

## Locks

All locks implement `io.lockscope.lock.MutexLock` (`lock()`, `unlock()`, `properties()`). It
deliberately does **not** implement `java.util.concurrent.locks.Lock`, because the textbook locks
support neither interruption, timed acquisition nor conditions.

Common to the five textbook locks (`AbstractOwnedLock`):

- **Not reentrant.** Re-locking by the owner throws `IllegalMonitorStateException` instead of
  self-deadlocking.
- **Ownership checked.** `unlock()` by a non-owner throws `IllegalMonitorStateException` and leaves
  the lock unchanged. The owner field is a plain field; this is sound because a thread can only
  read a reference to itself if it wrote it and has not cleared it.
- **Not interruptible, no timeouts, no cancellation.** A waiting thread waits until it acquires.
- **Spinning** uses `Thread.onSpinWait()` as a CPU hint. Waiting threads never yield or park,
  so they degrade badly when there are more runnable threads than CPUs.

| | TAS | TTAS | Backoff | CLH | MCS | ReentrantLock | fair ReentrantLock |
|---|---|---|---|---|---|---|---|
| Fairness | none | none | none | FIFO | FIFO | none (barging) | FIFO |
| Waiting | RMW spin | read spin | read spin + delay | spin on predecessor | spin on own node | spin, then park | spin, then park |
| Space | O(1) | O(1) | O(1) | O(L+n) | O(L+n) | O(L + waiters) | O(L + waiters) |
| Reentrant | no | no | no | no | no | yes | yes |

### TAS: test-and-set (`TasLock`)

- **Idea:** `while (state.getAndSet(true)) spin; … state.set(false)`.
- **Synchronization:** `AtomicBoolean.getAndSet` (volatile read+write) and a volatile `set(false)`.
  The successful `getAndSet` reads the previous owner's `false`, so the previous critical section
  happens-before the next (JLS 17.4.4).
- **Progress:** deadlock-free, not starvation-free.
- **Limitation:** every spin is an RMW that needs the cache line exclusively, so waiters and the
  owner fight over one line.

### TTAS: test-and-test-and-set (`TtasLock`)

- **Idea:** spin on `state.get()`; only when it reads `false`, try `getAndSet(true)`; on failure go
  back to reading.
- **The race** between observing `false` and acquiring is harmless: the `getAndSet` result alone
  decides ownership.
- **Limitation:** each release makes every waiter miss and race at once (a release storm).

### Exponential backoff (`BackoffLock`)

- **Idea:** TTAS; after a lost race, busy-wait a uniform random delay in `[0, limit)` and double
  `limit` up to `maxDelayNanos` (full jitter).
- **Parameters:** `minDelayNanos > 0`, `minDelayNanos ≤ maxDelayNanos ≤ 10 ms`, validated in the
  constructor. Doubling is overflow-safe (`nextLimit`). Defaults 100 ns – 10 µs.
- **Correctness** is exactly TTAS's; backoff is a contention-management policy, not a correctness
  mechanism. The delay is timed with `System.nanoTime`, because `Thread.sleep` is millisecond-grained
  on Windows.

### CLH queue lock (`ClhLock`)

- **Idea:** each thread swaps its node into `tail`, remembers the old tail as `pred`, and spins on
  `pred.locked`. Release sets `my.locked = false` and **adopts `pred` as its node for next time**.
- **Node lifecycle:** reusing one's own node immediately would be unsafe: the successor may not
  have observed `locked == false` yet. The predecessor's node is safe to reuse because only this
  thread ever read it, and it has stopped. Nodes are reclaimed by the garbage collector.
- **Memory ordering:** `locked` is volatile; the release write synchronizes-with the successor's
  read that sees `false`. `my.locked = true` is written before the node is published through the
  volatile `getAndSet` on `tail`.
- **Fairness:** FIFO in the order of the `getAndSet` on `tail`.
- **Limitations:** spins on a remote node (fine on cache-coherent machines, poor on NUMA without
  coherent caches); a descheduled waiter blocks all threads behind it; `ThreadLocal` lookups are
  part of each measured acquisition.

### MCS queue lock (`McsLock`)

- **Idea:** explicit queue. Enqueue with `pred = tail.getAndSet(my)`; if there was a predecessor,
  link `pred.next = my` and spin on `my.locked`. Release: if `my.next == null`, try
  `tail.compareAndSet(my, null)`; if that fails, a successor has swapped in but not linked yet, so
  wait for `my.next` to appear; then set `my.next.locked = false`.
- **The enqueue/link race** is the subtle part: between a successor's `getAndSet` and its write of
  `pred.next`, the owner sees no successor yet the CAS fails. The release therefore waits; MCS
  release is not wait-free.
- **Node lifecycle:** one node per thread per lock; `next` is reset before reuse. After `unlock()`
  returns, no other thread holds a reference to the node.
- **Memory ordering:** `locked` and `next` are volatile; hand-off is a volatile write the successor
  reads. In the uncontended path the hand-over is through `tail` (the releasing CAS and the next
  `getAndSet` are volatile operations on the same variable).

### Baselines (`JdkReentrantLock`)

`java.util.concurrent.locks.ReentrantLock` in non-fair and fair mode. Industrial AQS-based locks
that park waiting threads. They are labelled *baseline* everywhere: they are reentrant and give up
the CPU while waiting, so they are not equivalent to the spin locks. Their behaviour above the CPU
count is not comparable to spin locks.

### Negative control (`NoLock`)

Does nothing. Exists only to prove that the correctness checks detect broken mutual exclusion. It is
rejected as a benchmark candidate.

### Measured: queue-lock convoys under oversubscription

With twice as many spinning threads as CPUs, CLH and MCS still made progress in every run, but
throughput fell to about 62–71 acquisitions per second on the Windows 11 development machine:
roughly one hand-off per 15.6 ms scheduler tick. A FIFO lock can only hand the lock to the next
thread in the queue; when that thread is descheduled, every other thread spins until the OS runs
it again. TAS/TTAS do not convoy this way (any running thread can win), and `ReentrantLock` parks
waiters instead of spinning. The test `oversubscribedThreadsStillMakeProgress` therefore checks
progress and correctness under oversubscription, not speed.

**Lock tests:** `LockContractTest` (single-thread contract, ownership, reentry rejection, waiter
blocked until release, hand-off visibility ping-pong), `LockStressTest` (lost-update and overlap
checks at ≥ 4 threads, oversubscribed 2×CPU run, negative control, timeout detection),
`BackoffLockTest` (parameter validation, overflow). **Benchmarks:** `LockBenchmark`.

## Concurrent sets

All implement `io.lockscope.set.ConcurrentSet<E extends Comparable<? super E>>`: `add`, `remove`,
`contains` (linearizable in every implementation), `size`, `snapshot`, `checkInvariants`,
`properties`. `null` is rejected. Head and tail **sentinels are marked by kind, not by value**, so
`Integer.MIN_VALUE` and `Integer.MAX_VALUE` are ordinary elements (tested).

**Invariants** (checked by `checkInvariants()` on a quiescent list):

1. Reachable elements are strictly increasing (so there are no duplicates).
2. The traversal from `head` reaches the `tail` sentinel (no cycles, no broken links).
3. No node lock is held (fine, optimistic, lazy).
4. No marked node is reachable (lazy). In the lock-free list marked nodes may legitimately remain
   reachable until a later `find` unlinks them; only ordering is checked.

`size()` and `snapshot()` are linearizable only for the coarse list; elsewhere they are weakly
consistent during updates and exact when quiescent.

| | Coarse | Fine | Optimistic | Lazy | Lock-free |
|---|---|---|---|---|---|
| add/remove | blocking | blocking | blocking | blocking | lock-free |
| contains | blocking | blocking | blocking | wait-free | wait-free |
| Locks per update | 1 | 2 per node visited | 2 | 2 | 0 (CAS) |
| Traversals per update | 1 | 1 | 2 (validation) | 1 | ≥ 1 |

### Coarse-grained (`CoarseList`)

One `MutexLock` (default: non-fair `ReentrantLock`; any lab lock can be injected) guards every
operation. Linearization point: anywhere inside the critical section. Readers serialize too.

### Fine-grained (`FineList`)

Hand-over-hand locking with a `ReentrantLock` per node: lock `curr` before unlocking `pred`. All
threads lock in list order, so there is no deadlock. `next` fields are only accessed under the
owning node's lock and need not be volatile. Threads cannot overtake one another.

### Optimistic (`OptimisticList`)

Search without locks, lock `pred` and `curr`, then validate by re-traversing from `head` that
`pred` is reachable and `pred.next == curr`; retry otherwise. Safe in Java because removed nodes
keep their `next`, the GC keeps them alive, and `next` is volatile. Not starvation-free.

### Lazy (`LazyList`)

Each node has a volatile `marked` flag. `remove` marks (logical removal, **the linearization
point**) and then unlinks (physical removal). Validation is local: `!pred.marked && !curr.marked &&
pred.next == curr`. `contains` takes no locks and never retries: wait-free. Logical and physical
removal differ because a reachable node is not necessarily a member; membership is "reachable and
unmarked".

### Lock-free (`LockFreeList`)

Harris–Michael list with `AtomicMarkableReference<Node>` holding `(next, marked)` in one atomic
unit. `remove` CASes the mark on (linearization point) and makes one attempt to unlink; `find`
unlinks ("snips") marked nodes it meets and restarts if a snip fails; `add` CASes `pred.next` from
`(curr, unmarked)` to the new node. `contains` is wait-free.

- **ABA:** CAS compares references, and Java cannot recycle an object's identity while any thread
  references it, so the ABA problem of manual memory reclamation does not occur.
- **Cost:** `AtomicMarkableReference` allocates an internal pair object per update; visible in the
  allocation column of benchmark results.
- **Progress:** add/remove are lock-free, not wait-free.

**Set tests:** `SequentialSetTest` (semantics vs `TreeSet`, 20,000 random operations, sentinels,
nulls, generic elements), `ConcurrentSetStressTest` (partitioned reference model, conservation at
high and low contention, bounded linearizability, negative controls). **Benchmarks:**
`SetBenchmark`.
