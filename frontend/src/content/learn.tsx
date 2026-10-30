import type { ReactNode } from 'react';

export interface Topic {
  id: string;
  title: string;
  summary: string;
  body: ReactNode;
}

function Code({ children }: { children: string }) {
  return <pre className="code-block mono">{children}</pre>;
}

/** Inline diagram: two threads interleaving a non-atomic increment. */
function LostUpdateDiagram() {
  const rows = [
    ['T1', 'read count → 5', ''],
    ['T2', '', 'read count → 5'],
    ['T1', 'write count ← 6', ''],
    ['T2', '', 'write count ← 6'],
  ];
  return (
    <div className="table-wrap" style={{ maxWidth: 460 }}>
      <table>
        <caption className="visually-hidden">Interleaving that loses an update</caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Thread 1</th>
            <th scope="col">Thread 2</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([, a, b], i) => (
            <tr key={i}>
              <td className="num">{i + 1}</td>
              <td className="mono">{a}</td>
              <td className="mono">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ padding: '6px 10px' }}>
        Two increments ran, but the count only went from 5 to 6.
      </p>
    </div>
  );
}

export const TOPICS: Topic[] = [
  {
    id: 'concurrency-vs-parallelism',
    title: 'Concurrency versus parallelism',
    summary: 'Overlapping lifetimes versus simultaneous execution.',
    body: (
      <>
        <p>
          <strong>Concurrency</strong> means several tasks are in progress during overlapping time periods;
          their steps can interleave in any order. <strong>Parallelism</strong> means steps actually execute
          at the same instant on different cores. A concurrent program on one core still has every
          interleaving problem below; parallel hardware adds memory effects such as caches and store buffers.
        </p>
        <p>
          Locks make concurrent code correct; they usually limit parallelism, because the code inside a
          critical section runs one thread at a time. That is why a single contended lock cannot speed up with
          more threads (Amdahl's law).
        </p>
      </>
    ),
  },
  {
    id: 'race-conditions',
    title: 'Race conditions and lost updates',
    summary: 'When the result depends on the interleaving.',
    body: (
      <>
        <p>
          A <strong>race condition</strong> is a bug where the outcome depends on how threads interleave. The
          classic case is
          <code> count++</code>, which is really a read, an add and a write. Two threads can both read the
          same value:
        </p>
        <LostUpdateDiagram />
        <p>
          A <strong>data race</strong> in the Java sense is two unsynchronized accesses to the same variable,
          at least one a write. Programs with data races may observe values that no interleaving explains,
          because the Java Memory Model only promises sequential consistency to data-race-free programs.
        </p>
        <p>
          LockScope's lost-update check runs exactly this pattern inside each lock; the no-op control lock
          loses updates.
        </p>
      </>
    ),
  },
  {
    id: 'atomic-operations',
    title: 'Atomic operations',
    summary: 'Read-modify-write steps that cannot be split.',
    body: (
      <>
        <p>
          Hardware provides instructions that read and update a memory location in one indivisible step. Java
          exposes them through <code>java.util.concurrent.atomic</code>:
        </p>
        <Code>{`getAndSet(v)          // swap: returns the old value (TAS, CLH, MCS enqueue)
compareAndSet(e, v)   // write v only if the current value is e (MCS release, lock-free list)
getAndIncrement()     // fetch-and-add`}</Code>
        <p>
          Atomic operations also order memory: in Java they have volatile semantics, so a successful
          <code> getAndSet</code> sees everything written before the volatile write it reads. Every lock in
          LockScope relies on this to make the previous owner's writes visible to the next owner.
        </p>
      </>
    ),
  },
  {
    id: 'mutual-exclusion',
    title: 'Mutual exclusion',
    summary: 'At most one thread in the critical section.',
    body: (
      <>
        <p>
          A lock guarantees <strong>mutual exclusion</strong>: critical sections of different threads never
          overlap. Correct locks also need a happens-before edge from one release to the next acquire,
          otherwise the next owner could read stale values even though the sections did not overlap.
        </p>
        <p>
          LockScope tests both: an occupancy counter detects overlaps directly, and a plain, non-volatile
          counter detects lost updates caused by overlaps or missing visibility.
        </p>
      </>
    ),
  },
  {
    id: 'safety-liveness',
    title: 'Safety and liveness',
    summary: 'Nothing bad happens; something good eventually happens.',
    body: (
      <>
        <p>
          <strong>Safety</strong> properties say nothing bad ever happens (two owners at once, a lost update,
          a duplicate element). A single execution can violate them, so testing can find violations.
        </p>
        <p>
          <strong>Liveness</strong> properties say something good eventually happens: a thread trying to lock
          eventually gets it. Tests cannot prove liveness; a timeout can only suggest a deadlock or livelock.
          LockScope reports timeouts as their own category for that reason.
        </p>
      </>
    ),
  },
  {
    id: 'deadlock-starvation',
    title: 'Deadlock and starvation',
    summary: 'Nobody progresses, or one thread never does.',
    body: (
      <>
        <p>
          <strong>Deadlock</strong>: threads wait for each other in a cycle. Hand-over-hand list locking
          avoids it by acquiring node locks in one global order (head to tail).
        </p>
        <p>
          <strong>Starvation</strong>: the system progresses but one thread never acquires. TAS, TTAS and
          backoff locks allow it; CLH and MCS queue threads in FIFO order and are starvation-free.
        </p>
        <p>
          A non-reentrant lock deadlocks if its owner locks it again; LockScope's textbook locks detect this
          and throw instead.
        </p>
      </>
    ),
  },
  {
    id: 'contention-caches',
    title: 'Lock contention and cache coherence',
    summary: 'Why spinning on one shared word is slow.',
    body: (
      <>
        <p>
          Each core caches memory in lines. To write a line, a core needs it exclusively, which invalidates
          every other copy. A TAS lock writes on every attempt, so waiting cores keep stealing the line from
          each other. TTAS spins on a read of a cached copy, but every release triggers a burst of misses and
          atomic attempts.
        </p>
        <p>
          Queue locks give each waiter its own location to spin on, so a release disturbs one waiter. Backoff
          reduces the burst by making losers wait. None of this changes correctness; it changes how throughput
          behaves as threads are added.
        </p>
      </>
    ),
  },
  {
    id: 'linearizability',
    title: 'Linearizability',
    summary: 'Each operation appears to take effect at one instant.',
    body: (
      <>
        <p>
          A concurrent object is <strong>linearizable</strong> if every execution is equivalent to some
          sequential execution that respects real-time order: if operation A finished before B started, A
          comes first. Each operation appears to take effect at a <em>linearization point</em> between its
          call and its return.
        </p>
        <p>
          LockScope records short histories with a shared atomic clock and searches for a valid sequential
          order (Wing and Gong with memoization). Because set operations on different keys are independent,
          each key is checked separately. This verifies the recorded histories only; it is not a proof for all
          executions.
        </p>
      </>
    ),
  },
  {
    id: 'progress-guarantees',
    title: 'Lock-freedom and wait-freedom',
    summary: 'Progress guarantees without locks.',
    body: (
      <>
        <ul>
          <li>
            <strong>Blocking</strong>: a thread descheduled while holding a lock can stop everyone else.
          </li>
          <li>
            <strong>Lock-free</strong>: some thread always completes in a finite number of steps; individual
            threads may retry forever. The lock-free list's add and remove are lock-free.
          </li>
          <li>
            <strong>Wait-free</strong>: every thread completes in a finite number of its own steps. The lazy
            and lock-free lists' contains is wait-free.
          </li>
        </ul>
        <p>Stronger progress does not imply higher throughput; it buys robustness against delays.</p>
      </>
    ),
  },
  {
    id: 'list-synchronization',
    title: 'Concurrent linked-list synchronization',
    summary: 'From one lock to no locks, in five steps.',
    body: (
      <>
        <ol>
          <li>
            <strong>Coarse</strong>: one lock around everything. Simple and linearizable, fully serial.
          </li>
          <li>
            <strong>Fine-grained</strong>: a lock per node, taken hand over hand. Threads pipeline along the
            list but cannot overtake.
          </li>
          <li>
            <strong>Optimistic</strong>: search without locks, lock two nodes, validate by re-traversal, retry
            on conflict.
          </li>
          <li>
            <strong>Lazy</strong>: mark a node deleted before unlinking it, so validation is local and
            contains needs no locks.
          </li>
          <li>
            <strong>Lock-free</strong>: put the mark in the same atomic word as the next pointer and use
            compare-and-set; searches help unlink marked nodes.
          </li>
        </ol>
        <p>Step through each one in the Data Structure Lab; see measured results in the Comparison page.</p>
      </>
    ),
  },
  {
    id: 'benchmarking',
    title: 'Reading benchmark results',
    summary: 'What the numbers can and cannot tell you.',
    body: (
      <>
        <p>
          LockScope measures with JMH, which handles JIT warm-up, dead-code elimination and fresh JVM forks.
          Throughput is operations per microsecond across all threads. Speedup is{' '}
          <code>S(n) = X(n) / X(1)</code> and efficiency is
          <code> E(n) = S(n) / n</code>.
        </p>
        <p>
          Error bars are 99.9% confidence intervals of the mean across iterations. When two intervals overlap,
          the data does not establish which is faster. Results depend on the CPU, the OS scheduler, the JDK
          and background load, so compare only runs from the same machine and settings. A single shared lock
          is not expected to speed up at all: its critical section is serial by design.
        </p>
      </>
    ),
  },
];
