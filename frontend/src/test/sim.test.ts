import { describe, expect, it } from 'vitest';
import { ownersAt, simulateLock, type LockAlgorithm } from '../sim/lockSim';
import { emptyList, members, runOp, type ListOp, type ListStrategy, type SimNode } from '../sim/listSim';
import { mulberry32 } from '../sim/random';

const ALGORITHMS: LockAlgorithm[] = ['tas', 'ttas', 'clh', 'mcs'];
const STRATEGIES: ListStrategy[] = ['coarse', 'fine', 'optimistic', 'lazy', 'lockfree'];

describe('lock simulation', () => {
  it.each(ALGORITHMS)('%s never has two owners and every thread finishes', (algorithm) => {
    for (let seed = 1; seed <= 40; seed++) {
      const steps = simulateLock({ algorithm, threads: 4, acquisitionsPerThread: 3, seed, maxSteps: 5000 });
      for (const s of steps) expect(ownersAt(s)).toBeLessThanOrEqual(1);
      const last = steps[steps.length - 1];
      expect(last?.threads.every((t) => t.phase === 'done' && t.acquisitions === 3)).toBe(true);
    }
  });

  it('is deterministic for a seed', () => {
    const a = simulateLock({ algorithm: 'mcs', threads: 3, acquisitionsPerThread: 2, seed: 9 });
    const b = simulateLock({ algorithm: 'mcs', threads: 3, acquisitionsPerThread: 2, seed: 9 });
    expect(a.map((s) => s.action)).toEqual(b.map((s) => s.action));
  });

  it('TTAS spends fewer RMW operations than TAS on the same schedule', () => {
    let tas = 0;
    let ttas = 0;
    for (let seed = 1; seed <= 20; seed++) {
      tas +=
        simulateLock({ algorithm: 'tas', threads: 4, acquisitionsPerThread: 2, seed }).at(-1)?.rmwOps ?? 0;
      ttas +=
        simulateLock({ algorithm: 'ttas', threads: 4, acquisitionsPerThread: 2, seed }).at(-1)?.rmwOps ?? 0;
    }
    expect(ttas).toBeLessThan(tas);
  });

  it('MCS traces include the enqueue/link race for some seed', () => {
    const found = Array.from({ length: 200 }, (_, seed) =>
      simulateLock({ algorithm: 'mcs', threads: 3, acquisitionsPerThread: 2, seed }),
    ).some((steps) => steps.some((s) => s.action.includes('compareAndSet failed')));
    expect(found).toBe(true);
  });
});

describe('list simulation', () => {
  it.each(STRATEGIES)('%s matches a reference set on random operations', (strategy) => {
    const random = mulberry32(17);
    let list: SimNode[] = emptyList();
    const reference = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const key = Math.floor(random() * 20);
      const op: ListOp = (['add', 'remove', 'contains'] as const)[Math.floor(random() * 3)] ?? 'contains';
      const trace = runOp(list, strategy, op, key);
      const expected = op === 'add' ? !reference.has(key) : reference.has(key);
      if (op === 'add') reference.add(key);
      if (op === 'remove') reference.delete(key);
      expect(trace.result).toBe(expected);
      list = trace.after;
      expect(members(list)).toEqual([...reference].sort((a, b) => a - b));
      expect(trace.frames.length).toBeGreaterThan(1);
    }
  });

  it('fine-grained locking takes more locks than coarse on a long list', () => {
    let list = emptyList();
    for (let k = 0; k < 10; k++) list = runOp(list, 'coarse', 'add', k).after;
    expect(runOp(list, 'fine', 'contains', 9).counters.lockAcquisitions).toBeGreaterThan(
      runOp(list, 'coarse', 'contains', 9).counters.lockAcquisitions,
    );
    expect(runOp(list, 'lazy', 'contains', 9).counters.lockAcquisitions).toBe(0);
  });

  it('lazy removal shows logical before physical removal', () => {
    let list = emptyList();
    list = runOp(list, 'lazy', 'add', 5).after;
    const trace = runOp(list, 'lazy', 'remove', 5);
    const markedFrame = trace.frames.findIndex((f) => f.nodes.some((n) => n.key === 5 && n.marked));
    const goneFrame = trace.frames.findIndex((f, i) => i > markedFrame && !f.nodes.some((n) => n.key === 5));
    expect(markedFrame).toBeGreaterThan(0);
    expect(goneFrame).toBeGreaterThan(markedFrame);
  });
});
