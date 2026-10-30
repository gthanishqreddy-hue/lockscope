/**
 * Single-threaded, step-by-step model of the five list strategies, for teaching. It shows which
 * nodes each strategy traverses, locks, validates, marks and unlinks for one operation at a
 * time. It does not execute the Java engine and does not model concurrency; the counters count
 * steps in this model only.
 */

export type ListStrategy = 'coarse' | 'fine' | 'optimistic' | 'lazy' | 'lockfree';
export type ListOp = 'add' | 'remove' | 'contains';

export interface SimNode {
  key: number | 'head' | 'tail';
  marked: boolean;
}

export interface FrameNode extends SimNode {
  locked: boolean;
  role: 'pred' | 'curr' | null;
}

export interface Frame {
  text: string;
  nodes: FrameNode[];
  listLocked: boolean;
}

export interface OpTrace {
  op: ListOp;
  key: number;
  result: boolean;
  frames: Frame[];
  counters: { nodesVisited: number; lockAcquisitions: number; validations: number; casOps: number };
  after: SimNode[];
}

export function emptyList(): SimNode[] {
  return [
    { key: 'head', marked: false },
    { key: 'tail', marked: false },
  ];
}

function cmp(node: SimNode, key: number): number {
  if (node.key === 'head') return -1;
  if (node.key === 'tail') return 1;
  return node.key - key;
}

/** Elements in the set (reachable and unmarked). */
export function members(list: SimNode[]): number[] {
  return list.filter((n) => typeof n.key === 'number' && !n.marked).map((n) => n.key as number);
}

export function runOp(listIn: SimNode[], strategy: ListStrategy, op: ListOp, key: number): OpTrace {
  // Lock-free leaves marked nodes for later cleanup in some paths; model one-shot unlink success.
  const list = listIn.map((n) => ({ ...n }));
  const locked = new Set<number>();
  let listLocked = false;
  const frames: Frame[] = [];
  const counters = { nodesVisited: 0, lockAcquisitions: 0, validations: 0, casOps: 0 };
  let pred = 0;
  let curr = 1;

  const frame = (text: string, showCursor = true) =>
    frames.push({
      text,
      listLocked,
      nodes: list.map((n, i) => ({
        ...n,
        locked: locked.has(i),
        role: showCursor ? (i === pred ? 'pred' : i === curr ? 'curr' : null) : null,
      })),
    });
  const label = (i: number) => {
    const k = list[i]?.key;
    return k === 'head' ? 'head' : k === 'tail' ? 'tail' : String(k);
  };
  const node = (i: number) => list[i] as SimNode;
  const lock = (i: number) => {
    locked.add(i);
    counters.lockAcquisitions++;
  };

  /** Plain traversal used by the optimistic, lazy and lock-free searches. */
  const search = (skipMarked: boolean) => {
    pred = 0;
    curr = 1;
    counters.nodesVisited += 2;
    while (cmp(node(curr), key) < 0 || (skipMarked && node(curr).marked)) {
      pred = curr;
      curr++;
      counters.nodesVisited++;
    }
  };

  let result = false;
  frame(`${op}(${key}) with the ${strategy} strategy`, false);

  switch (strategy) {
    case 'coarse': {
      listLocked = true;
      counters.lockAcquisitions++;
      frame('Acquire the single list lock', false);
      search(false);
      frame(`Traverse under the lock: pred = ${label(pred)}, curr = ${label(curr)}`);
      result = apply(op);
      listLocked = false;
      frame('Release the list lock');
      break;
    }
    case 'fine': {
      pred = 0;
      curr = 1;
      lock(0);
      lock(1);
      counters.nodesVisited += 2;
      frame('Lock head, then its successor');
      while (cmp(node(curr), key) < 0) {
        locked.delete(pred);
        pred = curr;
        curr++;
        lock(curr);
        counters.nodesVisited++;
        frame(`Hand over hand: unlock the old pred, lock ${label(curr)}`);
      }
      result = apply(op);
      locked.clear();
      frame('Unlock curr and pred');
      break;
    }
    case 'optimistic': {
      search(false);
      frame(`Search without locks: pred = ${label(pred)}, curr = ${label(curr)}`);
      lock(pred);
      lock(curr);
      frame('Lock pred and curr');
      counters.validations++;
      counters.nodesVisited += pred + 1;
      frame(
        `Validate: re-traverse from head (${pred + 1} nodes) to confirm pred is reachable and pred.next == curr`,
      );
      result = apply(op);
      locked.clear();
      frame('Unlock both');
      break;
    }
    case 'lazy': {
      if (op === 'contains') {
        search(false);
        result = cmp(node(curr), key) === 0 && !node(curr).marked;
        frame(
          `Wait-free traversal, no locks: found ${label(curr)}${node(curr).marked ? ' (marked)' : ''} → ${result}`,
        );
        break;
      }
      search(false);
      frame(`Search without locks: pred = ${label(pred)}, curr = ${label(curr)}`);
      lock(pred);
      lock(curr);
      counters.validations++;
      frame('Lock pred and curr; validate locally: neither is marked and pred.next == curr');
      if (op === 'remove' && cmp(node(curr), key) === 0) {
        node(curr).marked = true;
        frame(`Logical removal: ${label(curr)}.marked = true (the element is now absent)`);
        list.splice(curr, 1);
        curr = pred + 1;
        frame('Physical removal: pred.next = curr.next');
        result = true;
      } else {
        result = apply(op);
      }
      locked.clear();
      frame('Unlock both');
      break;
    }
    case 'lockfree': {
      if (op === 'contains') {
        search(false);
        result = cmp(node(curr), key) === 0 && !node(curr).marked;
        frame(`Wait-free traversal: found ${label(curr)}${node(curr).marked ? ' (marked)' : ''} → ${result}`);
        break;
      }
      search(false);
      // find() unlinks any marked nodes it passes.
      for (let i = list.length - 2; i > 0; i--) {
        if (list[i]?.marked) {
          counters.casOps++;
          list.splice(i, 1);
        }
      }
      search(false);
      frame(
        `find(): window pred = ${label(pred)}, curr = ${label(curr)} (marked nodes on the way are snipped)`,
      );
      if (op === 'add') {
        if (cmp(node(curr), key) === 0) {
          frame(`${key} is present → return false`);
          result = false;
        } else {
          counters.casOps++;
          list.splice(curr, 0, { key, marked: false });
          frame(`CAS pred.next from (${label(curr + 1)}, unmarked) to the new node → linked`);
          result = true;
        }
      } else if (cmp(node(curr), key) !== 0) {
        frame(`${key} is absent → return false`);
        result = false;
      } else {
        counters.casOps++;
        node(curr).marked = true;
        frame(`CAS curr.next mark false → true: logical removal of ${key}`);
        counters.casOps++;
        list.splice(curr, 1);
        curr = pred + 1;
        frame('One CAS attempt to unlink it from pred (if it failed, a later find would snip it)');
        result = true;
      }
      break;
    }
  }

  frame(`Result: ${result}`, false);
  return { op, key, result, frames, counters, after: list };

  function apply(o: ListOp): boolean {
    const present = cmp(node(curr), key) === 0;
    if (o === 'contains') {
      frame(`curr is ${label(curr)} → ${present}`);
      return present;
    }
    if (o === 'add') {
      if (present) {
        frame(`${key} already present → return false`);
        return false;
      }
      list.splice(curr, 0, { key, marked: false });
      const lockedShift = [...locked].map((i) => (i >= curr ? i + 1 : i));
      locked.clear();
      lockedShift.forEach((i) => locked.add(i));
      frame(`Link new node ${key} between ${label(pred)} and ${label(curr + 1)}`);
      curr = curr + 1;
      return true;
    }
    if (!present) {
      frame(`${key} absent → return false`);
      return false;
    }
    list.splice(curr, 1);
    locked.delete(curr);
    frame(`Unlink ${key}: pred.next = curr.next`);
    return true;
  }
}
