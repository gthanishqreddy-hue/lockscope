/**
 * Theoretical descriptions of every algorithm. These are design-level claims (the same ones the
 * engine's LockProperties/SetProperties encode), never measurements, and the UI labels them as
 * "Theory" wherever they appear.
 */

export interface LockInfo {
  id: string;
  name: string;
  category: 'textbook' | 'baseline' | 'control';
  summary: string;
  fairness: string;
  waiting: string;
  reentrant: boolean;
  space: string;
  progress: string;
  contention: string;
  expectedScaling: string;
  limitations: string[];
  memoryOrdering: string;
  pseudocode: string;
}

export interface SetInfo {
  id: string;
  name: string;
  summary: string;
  synchronization: string;
  updateProgress: string;
  containsProgress: string;
  linearization: string;
  expectedScaling: string;
  limitations: string[];
  pseudocode: string;
}

export const LOCKS: LockInfo[] = [
  {
    id: 'tas',
    name: 'TAS',
    category: 'textbook',
    summary: 'Test-and-set: every attempt is an atomic getAndSet(true) on one shared flag.',
    fairness: 'None: a thread can starve',
    waiting: 'Spins with an atomic read-modify-write',
    reentrant: false,
    space: 'O(1) per lock',
    progress: 'Deadlock-free; not starvation-free',
    contention:
      'Every spin iteration requests the cache line in exclusive state, so waiters keep invalidating each other and the owner.',
    expectedScaling: 'Degrades quickly as threads are added.',
    limitations: ['Heavy coherence traffic under contention', 'No fairness', 'Burns CPU while waiting'],
    memoryOrdering:
      'getAndSet has volatile semantics; release is a volatile write. The next successful getAndSet reads that write, so the previous critical section happens-before the next.',
    pseudocode: `lock():
  while state.getAndSet(true):
    spin
unlock():
  state.set(false)`,
  },
  {
    id: 'ttas',
    name: 'TTAS',
    category: 'textbook',
    summary: 'Test-and-test-and-set: spin on a plain read, try getAndSet only when the lock looks free.',
    fairness: 'None: a thread can starve',
    waiting: 'Spins reading a cached copy',
    reentrant: false,
    space: 'O(1) per lock',
    progress: 'Deadlock-free; not starvation-free',
    contention:
      'Reads hit the local cache while the lock is held, but a release makes all waiters miss and race to getAndSet at once.',
    expectedScaling: 'Better than TAS, but release storms grow with the number of waiters.',
    limitations: ['Release storm on every unlock', 'No fairness'],
    memoryOrdering: 'Same as TAS: ownership is decided by the volatile getAndSet.',
    pseudocode: `lock():
  loop:
    while state.get(): spin
    if not state.getAndSet(true): return
unlock():
  state.set(false)`,
  },
  {
    id: 'backoff',
    name: 'Backoff',
    category: 'textbook',
    summary: 'TTAS plus randomized exponential backoff after each failed acquisition attempt.',
    fairness: 'None: a thread can starve',
    waiting: 'Spins, then waits a random, growing delay',
    reentrant: false,
    space: 'O(1) per lock',
    progress: 'Deadlock-free; not starvation-free',
    contention:
      'Backing off spreads out the retry storm. It manages contention; it does not change correctness.',
    expectedScaling: 'Often flatter than TTAS under contention; sensitive to the min/max delay parameters.',
    limitations: [
      'Tuning is machine- and workload-specific',
      'Can leave the lock idle while everyone backs off',
    ],
    memoryOrdering: 'Same as TTAS. The delay is a timed spin on System.nanoTime, not Thread.sleep.',
    pseudocode: `lock():
  limit = MIN
  loop:
    while state.get(): spin
    if not state.getAndSet(true): return
    pause(random(0, limit))
    limit = min(MAX, 2 * limit)`,
  },
  {
    id: 'clh',
    name: 'CLH',
    category: 'textbook',
    summary: 'Implicit queue: each thread spins on its predecessor’s node flag.',
    fairness: 'FIFO from the atomic swap on the tail',
    waiting: 'Spins on the predecessor’s node',
    reentrant: false,
    space: 'O(L + n) for L locks and n threads',
    progress: 'Starvation-free (FIFO)',
    contention: 'Each waiter spins on a different location; a release invalidates exactly one waiter’s line.',
    expectedScaling: 'Flat throughput under contention; one hand-off per acquisition.',
    limitations: [
      'Spins on a remote node: costly on NUMA without coherent caches',
      'A descheduled waiter blocks everyone behind it (convoy) when threads exceed CPUs',
    ],
    memoryOrdering:
      'locked is volatile. The release write locked=false synchronizes-with the successor’s spin read that sees false. On release a thread adopts its predecessor’s node, which only it was reading.',
    pseudocode: `lock():
  my.locked = true
  pred = tail.getAndSet(my)
  while pred.locked: spin
unlock():
  my.locked = false
  my = pred        // recycle predecessor's node`,
  },
  {
    id: 'mcs',
    name: 'MCS',
    category: 'textbook',
    summary:
      'Explicit linked queue: each thread spins on its own node; the owner hands off to its successor.',
    fairness: 'FIFO from the atomic swap on the tail',
    waiting: 'Spins on its own node',
    reentrant: false,
    space: 'O(L + n) for L locks and n threads',
    progress: 'Starvation-free (FIFO)',
    contention:
      'Local spinning even without coherent caches. Release may wait briefly for a successor to link itself.',
    expectedScaling: 'Flat throughput under contention, similar to CLH.',
    limitations: ['Release is not wait-free (enqueue/link race)', 'Convoys when threads exceed CPUs'],
    memoryOrdering:
      'locked and next are volatile; tail is an AtomicReference. Hand-off is a volatile write the successor reads; the uncontended path hands over through the CAS/getAndSet on tail.',
    pseudocode: `lock():
  my.next = null; my.locked = true
  pred = tail.getAndSet(my)
  if pred != null:
    pred.next = my
    while my.locked: spin
unlock():
  if my.next == null:
    if tail.compareAndSet(my, null): return
    while my.next == null: spin   // successor still linking
  my.next.locked = false`,
  },
  {
    id: 'jdk-reentrant',
    name: 'ReentrantLock',
    category: 'baseline',
    summary: 'Standard library baseline (AbstractQueuedSynchronizer), non-fair mode.',
    fairness: 'None (barging allowed)',
    waiting: 'Spins briefly, then parks in the OS',
    reentrant: true,
    space: 'O(L + waiting threads)',
    progress: 'Blocking; barging can delay queued threads',
    contention: 'Parks waiters, which frees the CPU but makes wake-up expensive.',
    expectedScaling: 'Robust when threads exceed CPUs; hand-offs cost a park/unpark.',
    limitations: ['Not a textbook algorithm; not directly comparable with pure spin locks'],
    memoryOrdering: 'Guaranteed by java.util.concurrent.locks.Lock: unlock happens-before a later lock.',
    pseudocode: `lock():   AQS.acquire(1)   // CAS fast path, else enqueue + park
unlock(): AQS.release(1)   // CAS state, unpark successor`,
  },
  {
    id: 'jdk-reentrant-fair',
    name: 'ReentrantLock (fair)',
    category: 'baseline',
    summary: 'Standard library baseline in fair mode: queued threads acquire in order.',
    fairness: 'FIFO among queued threads',
    waiting: 'Spins briefly, then parks in the OS',
    reentrant: true,
    space: 'O(L + waiting threads)',
    progress: 'Blocking; starvation-free among queued threads',
    contention: 'Every contended hand-off goes through park/unpark, so fairness costs throughput.',
    expectedScaling: 'Typically the lowest throughput under contention.',
    limitations: ['Strict fairness removes barging, which is what makes the non-fair mode fast'],
    memoryOrdering: 'Same as the non-fair mode.',
    pseudocode: `lock():   if queue empty and CAS(state): own
          else enqueue + park
unlock(): release, unpark head of queue`,
  },
  {
    id: 'none',
    name: 'No lock (control)',
    category: 'control',
    summary: 'Negative control: lock() and unlock() do nothing. The correctness harness must catch it.',
    fairness: 'Not applicable',
    waiting: 'Never waits',
    reentrant: false,
    space: 'O(1)',
    progress: 'Not a lock',
    contention: 'None, because it provides no exclusion.',
    expectedScaling: 'Not benchmarked.',
    limitations: ['Deliberately incorrect'],
    memoryOrdering: 'Provides no ordering at all.',
    pseudocode: `lock():   // nothing
unlock(): // nothing`,
  },
];

export const SETS: SetInfo[] = [
  {
    id: 'coarse',
    name: 'Coarse-grained',
    summary: 'One lock protects the whole list; every operation runs inside it.',
    synchronization: 'Single lock (ReentrantLock by default)',
    updateProgress: 'Blocking',
    containsProgress: 'Blocking',
    linearization: 'Anywhere inside the critical section.',
    expectedScaling: 'Serial: throughput does not grow with threads.',
    limitations: ['Readers serialize with writers and with each other'],
    pseudocode: `add(x):
  lock.lock()
  find pred, curr with pred < x <= curr
  if curr == x: result = false
  else: pred.next = new Node(x, curr); result = true
  lock.unlock()`,
  },
  {
    id: 'fine',
    name: 'Fine-grained',
    summary: 'Hand-over-hand locking: hold the current node’s lock while taking the next one.',
    synchronization: 'Per-node locks acquired in list order',
    updateProgress: 'Blocking',
    containsProgress: 'Blocking',
    linearization: 'While holding pred and curr at the final position.',
    expectedScaling: 'Some overlap, but threads queue behind each other along the list.',
    limitations: [
      'Two lock operations per node visited',
      'No overtaking: a slow thread delays all behind it',
    ],
    pseudocode: `add(x):
  pred = head; pred.lock()
  curr = pred.next; curr.lock()
  while curr < x:
    pred.unlock(); pred = curr
    curr = curr.next; curr.lock()
  ... link if absent ...
  curr.unlock(); pred.unlock()`,
  },
  {
    id: 'optimistic',
    name: 'Optimistic',
    summary: 'Search without locks, lock pred and curr, then validate by re-traversing from the head.',
    synchronization: 'Per-node locks on the final window only',
    updateProgress: 'Blocking (retries on validation failure)',
    containsProgress: 'Blocking (also locks and validates)',
    linearization: 'While holding pred and curr after successful validation.',
    expectedScaling: 'Better than fine-grained when conflicts are rare; every operation traverses twice.',
    limitations: ['Validation re-traversal doubles the cost', 'Not starvation-free'],
    pseudocode: `add(x):
  loop:
    find pred, curr without locks
    pred.lock(); curr.lock()
    if validate(pred, curr):   // pred reachable and pred.next == curr
      ... link if absent ...; return
    unlock both and retry`,
  },
  {
    id: 'lazy',
    name: 'Lazy',
    summary: 'Logical removal (mark) before physical unlinking; local validation; wait-free contains.',
    synchronization: 'Per-node locks on the final window, plus a marked flag',
    updateProgress: 'Blocking',
    containsProgress: 'Wait-free',
    linearization: 'remove: when marked becomes true. add: when pred.next is written.',
    expectedScaling: 'Scales well for read-heavy mixes; contains never locks.',
    limitations: ['Updates still lock', 'Marked nodes are briefly reachable'],
    pseudocode: `remove(x):
  loop:
    find pred, curr; lock both
    if !pred.marked && !curr.marked && pred.next == curr:
      if curr != x: return false
      curr.marked = true         // logical
      pred.next = curr.next      // physical
      return true
contains(x):
  walk to curr >= x
  return curr == x && !curr.marked`,
  },
  {
    id: 'lockfree',
    name: 'Lock-free',
    summary:
      'Harris-Michael list: deletion mark and next pointer share one atomic word; finders help unlink.',
    synchronization: 'compareAndSet on (next, mark) pairs (AtomicMarkableReference)',
    updateProgress: 'Lock-free',
    containsProgress: 'Wait-free',
    linearization: 'remove: the CAS that sets the mark. add: the CAS that links the node.',
    expectedScaling: 'No locks to convoy on; pays an allocation per pointer update in Java.',
    limitations: [
      'AtomicMarkableReference allocates a pair object on every update',
      'Updates are lock-free, not wait-free: an individual thread can retry indefinitely',
    ],
    pseudocode: `find(x):   // returns (pred, curr), unlinking marked nodes on the way
  retry: pred = head; curr = pred.next
  loop:
    succ, marked = curr.next.get()
    while marked:
      if !pred.next.CAS(curr, succ, false, false): goto retry
      curr = succ; succ, marked = curr.next.get()
    if curr >= x: return (pred, curr)
    pred = curr; curr = succ
remove(x):
  (pred, curr) = find(x); if curr != x: return false
  if !curr.next.CAS(succ, succ, false, true): retry
  pred.next.CAS(curr, succ, false, false)   // one attempt; find helps later`,
  },
];

export function lockInfo(id: string): LockInfo | undefined {
  return LOCKS.find((l) => l.id === id);
}

export function setInfo(id: string): SetInfo | undefined {
  return SETS.find((s) => s.id === id);
}

export function algorithmName(id: string): string {
  return lockInfo(id)?.name ?? setInfo(id)?.name ?? id;
}

/**
 * Fixed series slot per algorithm, so an algorithm keeps its color in every chart regardless of
 * which others are shown (color follows the entity, never its rank).
 */
const SERIES_SLOT: Record<string, number> = {
  tas: 1,
  ttas: 2,
  backoff: 3,
  clh: 4,
  mcs: 5,
  'jdk-reentrant': 6,
  'jdk-reentrant-fair': 7,
  coarse: 1,
  fine: 2,
  optimistic: 3,
  lazy: 4,
  lockfree: 5,
};

/** Marker shapes give every series a second, non-color identity channel. */
const SYMBOLS = ['circle', 'rect', 'triangle', 'diamond', 'pin', 'roundRect', 'arrow', 'circle'] as const;

export function seriesSlot(id: string): number {
  return SERIES_SLOT[id] ?? 8;
}

export function seriesSymbol(id: string): string {
  return SYMBOLS[(seriesSlot(id) - 1) % SYMBOLS.length] ?? 'circle';
}
