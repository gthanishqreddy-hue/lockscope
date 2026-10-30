package io.lockscope.correctness;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Bounded linearizability checker for histories of a set of integers.
 *
 * <p>Uses the Wing and Gong search: repeatedly pick an operation that no other pending operation
 * precedes in real time, check that its recorded result agrees with the sequential set
 * specification, and backtrack on disagreement. Visited (linearized-subset, state) pairs are
 * memoized (as in Lowe's improvement), which keeps the search fast on the small histories the
 * harness generates.
 *
 * <p>Set operations on different keys commute and each touches a single key, so a history is
 * linearizable iff its restriction to every key is linearizable (linearizability is a local
 * property; Herlihy and Wing, 1990). The checker therefore checks each key's sub-history
 * separately, as a history of a boolean register.
 *
 * <p>Limits: at most {@link #MAX_OPS_PER_KEY} operations per key (the search uses a 64-bit mask),
 * and only {@code add}, {@code remove} and {@code contains}. {@code size()} is not checked. A
 * passing result shows that the specific recorded histories were linearizable, nothing more.
 */
public final class SetLinearizabilityChecker {

    /** Maximum operations on a single key the checker accepts. */
    public static final int MAX_OPS_PER_KEY = 62;

    /** Kind of set operation. */
    public enum OpType {
        ADD,
        REMOVE,
        CONTAINS
    }

    /**
     * A completed operation. {@code invoke} and {@code response} are ticks of a shared atomic
     * clock taken immediately before the call and immediately after it returned, so
     * {@code a.response < b.invoke} implies {@code a} finished before {@code b} started.
     */
    public record Op(int thread, OpType type, int key, boolean result, long invoke, long response) {
        @Override
        public String toString() {
            return String.format("T%d %s(%d) -> %s  [%d, %d]", thread, type.name().toLowerCase(), key, result,
                    invoke, response);
        }
    }

    /** Verdict for a whole history. */
    public record Verdict(boolean linearizable, boolean inconclusive, Integer failingKey, List<Op> failingHistory) {}

    private SetLinearizabilityChecker() {}

    /**
     * Checks a history.
     *
     * @param history completed operations, in any order
     * @param initiallyPresent keys present before the history started
     */
    public static Verdict check(List<Op> history, Set<Integer> initiallyPresent) {
        Map<Integer, List<Op>> byKey = new HashMap<>();
        for (Op op : history) {
            byKey.computeIfAbsent(op.key(), k -> new ArrayList<>()).add(op);
        }
        for (Map.Entry<Integer, List<Op>> entry : byKey.entrySet()) {
            List<Op> ops = entry.getValue();
            if (ops.size() > MAX_OPS_PER_KEY) {
                return new Verdict(false, true, entry.getKey(), List.copyOf(ops));
            }
            if (!checkKey(ops, initiallyPresent.contains(entry.getKey()))) {
                return new Verdict(false, false, entry.getKey(), List.copyOf(ops));
            }
        }
        return new Verdict(true, false, null, List.of());
    }

    private static boolean checkKey(List<Op> ops, boolean initiallyPresent) {
        return search(ops, 0L, initiallyPresent, new HashSet<>());
    }

    private static boolean search(List<Op> ops, long done, boolean present, Set<Long> visited) {
        int n = ops.size();
        long all = n == 64 ? -1L : (1L << n) - 1;
        if (done == all) {
            return true;
        }
        // Encode (done, present) into one key; n <= 62 leaves bit 63 free for the state.
        long memoKey = done | (present ? Long.MIN_VALUE : 0L);
        if (!visited.add(memoKey)) {
            return false;
        }
        // An op can go next only if no pending op responded before it was invoked.
        long earliestPendingResponse = Long.MAX_VALUE;
        for (int i = 0; i < n; i++) {
            if ((done & (1L << i)) == 0) {
                earliestPendingResponse = Math.min(earliestPendingResponse, ops.get(i).response());
            }
        }
        for (int i = 0; i < n; i++) {
            if ((done & (1L << i)) != 0) {
                continue;
            }
            Op op = ops.get(i);
            if (op.invoke() > earliestPendingResponse) {
                continue;
            }
            boolean expected;
            boolean next;
            switch (op.type()) {
                case ADD -> {
                    expected = !present;
                    next = true;
                }
                case REMOVE -> {
                    expected = present;
                    next = false;
                }
                default -> {
                    expected = present;
                    next = present;
                }
            }
            if (op.result() == expected && search(ops, done | (1L << i), next, visited)) {
                return true;
            }
        }
        return false;
    }
}
