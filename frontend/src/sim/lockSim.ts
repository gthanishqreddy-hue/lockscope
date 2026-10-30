import { mulberry32 } from './random';

/**
 * Step-by-step model of the spin and queue locks, for teaching. Each scheduler tick lets one
 * thread execute one atomic step of the algorithm. The schedule is drawn from a seeded PRNG, so a
 * trace is deterministic for a given seed.
 *
 * This is a browser simulation of the algorithms' logic with sequentially consistent memory. It
 * does not run the Java engine and does not model caches, the JIT or the Java Memory Model; the
 * "RMW" and "shared read" counters only count operations in the model.
 */

export type LockAlgorithm = 'tas' | 'ttas' | 'clh' | 'mcs';

export type ThreadPhase = 'idle' | 'acquiring' | 'waiting' | 'critical' | 'releasing' | 'done';

export interface ThreadView {
  id: number;
  phase: ThreadPhase;
  pc: string;
  acquisitions: number;
  node?: string;
}

export interface QueueNodeView {
  id: string;
  owner: string;
  locked: boolean;
  next?: string | null;
}

export interface SimStep {
  index: number;
  thread: number | null;
  action: string;
  threads: ThreadView[];
  shared: Record<string, string>;
  nodes: QueueNodeView[];
  rmwOps: number;
  sharedReads: number;
}

export interface SimConfig {
  algorithm: LockAlgorithm;
  threads: number;
  acquisitionsPerThread: number;
  seed: number;
  maxSteps?: number;
}

interface Node {
  id: string;
  locked: boolean;
  next: Node | null;
}

interface T {
  id: number;
  pc: string;
  phase: ThreadPhase;
  acquisitions: number;
  csTicks: number;
  my: Node | null;
  pred: Node | null;
}

const CS_TICKS = 2;

export function simulateLock(config: SimConfig): SimStep[] {
  const { algorithm, acquisitionsPerThread } = config;
  const n = Math.max(1, Math.min(6, config.threads));
  const maxSteps = config.maxSteps ?? 400;
  const random = mulberry32(config.seed);

  let flag = false; // TAS/TTAS state
  let nodeCounter = 0;
  const newNode = (locked: boolean): Node => ({ id: `n${nodeCounter++}`, locked, next: null });
  let tail: Node | null = algorithm === 'clh' ? newNode(false) : null;
  const allNodes: Node[] = tail ? [tail] : [];
  const nodeOwner = new Map<string, string>();
  if (tail) nodeOwner.set(tail.id, 'initial');

  const threads: T[] = Array.from({ length: n }, (_, id) => {
    let my: Node | null = null;
    if (algorithm === 'clh' || algorithm === 'mcs') {
      my = newNode(false);
      allNodes.push(my);
      nodeOwner.set(my.id, `T${id}`);
    }
    return { id, pc: 'start', phase: 'idle', acquisitions: 0, csTicks: 0, my, pred: null };
  });

  let rmwOps = 0;
  let sharedReads = 0;
  const steps: SimStep[] = [];

  const snapshot = (index: number, thread: number | null, action: string): SimStep => {
    const owners = new Map<string, string>();
    for (const t of threads) if (t.my) owners.set(t.my.id, `T${t.id}`);
    const shared: Record<string, string> = {};
    if (algorithm === 'tas' || algorithm === 'ttas') shared['state'] = String(flag);
    else shared['tail'] = tail ? `${tail.id} (${owners.get(tail.id) ?? 'free'})` : 'null';
    const reachable = new Set<string>();
    if (algorithm === 'clh') {
      for (const t of threads) {
        if (t.my) reachable.add(t.my.id);
        if (t.pred) reachable.add(t.pred.id);
      }
      if (tail) reachable.add(tail.id);
    }
    return {
      index,
      thread,
      action,
      threads: threads.map((t) => ({
        id: t.id,
        phase: t.phase,
        pc: t.pc,
        acquisitions: t.acquisitions,
        node: t.my ? t.my.id : undefined,
      })),
      shared,
      nodes:
        algorithm === 'clh' || algorithm === 'mcs'
          ? allNodes
              .filter((node) => algorithm === 'mcs' || reachable.has(node.id))
              .map((node) => ({
                id: node.id,
                owner: owners.get(node.id) ?? 'recycled',
                locked: node.locked,
                next: algorithm === 'mcs' ? (node.next?.id ?? null) : undefined,
              }))
          : [],
      rmwOps,
      sharedReads,
    };
  };

  steps.push(snapshot(0, null, 'Initial state'));

  const enterCritical = (t: T) => {
    t.phase = 'critical';
    t.pc = 'critical section';
    t.csTicks = 0;
  };

  const finishRelease = (t: T) => {
    t.acquisitions++;
    t.phase = t.acquisitions >= acquisitionsPerThread ? 'done' : 'idle';
    t.pc = t.phase === 'done' ? 'done' : 'start';
  };

  /** Executes one atomic step of thread t and returns a description. */
  const step = (t: T): string => {
    if (t.pc === 'start') {
      t.phase = 'acquiring';
      t.pc = algorithm === 'tas' ? 'getAndSet' : algorithm === 'ttas' ? 'read state' : 'prepare node';
      return `T${t.id} calls lock()`;
    }
    if (t.phase === 'critical') {
      t.csTicks++;
      if (t.csTicks >= CS_TICKS) {
        t.phase = 'releasing';
        t.pc = algorithm === 'mcs' ? 'check next' : 'release';
        return `T${t.id} finishes its critical section`;
      }
      return `T${t.id} works inside the critical section`;
    }
    switch (algorithm) {
      case 'tas':
        if (t.pc === 'getAndSet') {
          rmwOps++;
          const old = flag;
          flag = true;
          if (!old) {
            enterCritical(t);
            return `T${t.id}: getAndSet(true) returned false → acquired`;
          }
          t.phase = 'waiting';
          return `T${t.id}: getAndSet(true) returned true → retry (another RMW on the shared line)`;
        }
        flag = false;
        finishRelease(t);
        return `T${t.id}: state.set(false) → released`;
      case 'ttas':
        if (t.pc === 'read state') {
          sharedReads++;
          if (flag) {
            t.phase = 'waiting';
            return `T${t.id}: reads state = true → keep spinning on the cached copy`;
          }
          t.pc = 'getAndSet';
          return `T${t.id}: reads state = false → try getAndSet`;
        }
        if (t.pc === 'getAndSet') {
          rmwOps++;
          const old = flag;
          flag = true;
          if (!old) {
            enterCritical(t);
            return `T${t.id}: getAndSet(true) returned false → acquired`;
          }
          t.phase = 'waiting';
          t.pc = 'read state';
          return `T${t.id}: lost the race (getAndSet returned true) → back to reading`;
        }
        flag = false;
        finishRelease(t);
        return `T${t.id}: state.set(false) → released`;
      case 'clh': {
        const my = t.my as Node;
        if (t.pc === 'prepare node') {
          my.locked = true;
          t.pc = 'swap tail';
          return `T${t.id}: ${my.id}.locked = true`;
        }
        if (t.pc === 'swap tail') {
          rmwOps++;
          t.pred = tail;
          tail = my;
          t.pc = 'spin on pred';
          return `T${t.id}: pred = tail.getAndSet(${my.id}) → pred is ${t.pred?.id}`;
        }
        if (t.pc === 'spin on pred') {
          sharedReads++;
          if (t.pred?.locked) {
            t.phase = 'waiting';
            return `T${t.id}: reads ${t.pred.id}.locked = true → wait (only this thread watches ${t.pred.id})`;
          }
          enterCritical(t);
          return `T${t.id}: reads ${t.pred?.id}.locked = false → acquired`;
        }
        my.locked = false;
        const pred = t.pred;
        t.my = pred;
        t.pred = null;
        finishRelease(t);
        return `T${t.id}: ${my.id}.locked = false; recycles predecessor node ${pred?.id}`;
      }
      case 'mcs': {
        const my = t.my as Node;
        if (t.pc === 'prepare node') {
          my.next = null;
          my.locked = true;
          t.pc = 'swap tail';
          return `T${t.id}: ${my.id}.next = null, ${my.id}.locked = true`;
        }
        if (t.pc === 'swap tail') {
          rmwOps++;
          const pred = tail;
          tail = my;
          t.pred = pred;
          if (pred === null) {
            enterCritical(t);
            return `T${t.id}: tail.getAndSet(${my.id}) returned null → acquired immediately`;
          }
          t.pc = 'link';
          return `T${t.id}: tail.getAndSet(${my.id}) returned ${pred.id} → must link behind it`;
        }
        if (t.pc === 'link') {
          (t.pred as Node).next = my;
          t.pc = 'spin on own node';
          return `T${t.id}: ${t.pred?.id}.next = ${my.id}`;
        }
        if (t.pc === 'spin on own node') {
          sharedReads++;
          if (my.locked) {
            t.phase = 'waiting';
            return `T${t.id}: ${my.id}.locked = true → wait on its own node`;
          }
          enterCritical(t);
          return `T${t.id}: ${my.id}.locked = false → acquired (handed off)`;
        }
        if (t.pc === 'check next') {
          sharedReads++;
          if (my.next) {
            t.pc = 'hand off';
            return `T${t.id}: ${my.id}.next = ${my.next.id} → hand off`;
          }
          t.pc = 'cas tail';
          return `T${t.id}: ${my.id}.next = null → try to reset tail`;
        }
        if (t.pc === 'cas tail') {
          rmwOps++;
          if (tail === my) {
            tail = null;
            finishRelease(t);
            return `T${t.id}: tail.compareAndSet(${my.id}, null) succeeded → released, no waiters`;
          }
          t.pc = 'wait for successor';
          return `T${t.id}: compareAndSet failed: a successor swapped in but has not linked yet`;
        }
        if (t.pc === 'wait for successor') {
          sharedReads++;
          if (!my.next) return `T${t.id}: waits for the successor to set ${my.id}.next`;
          t.pc = 'hand off';
          return `T${t.id}: successor ${my.next.id} linked`;
        }
        const succ = my.next as Node;
        my.next = null;
        succ.locked = false;
        finishRelease(t);
        return `T${t.id}: ${succ.id}.locked = false → lock handed to ${nodeOwner.get(succ.id)}`;
      }
    }
  };

  for (let i = 1; i <= maxSteps; i++) {
    const runnable = threads.filter((t) => t.phase !== 'done');
    if (runnable.length === 0) break;
    const t = runnable[Math.floor(random() * runnable.length)] as T;
    const action = step(t);
    steps.push(snapshot(i, t.id, action));
  }
  return steps;
}

/** Number of threads inside the critical section at a step; must never exceed 1. */
export function ownersAt(step: SimStep): number {
  return step.threads.filter((t) => t.phase === 'critical' || t.phase === 'releasing').length;
}
