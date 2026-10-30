package io.lockscope.set;

import java.util.List;
import java.util.Objects;

/** Helpers shared by the list implementations. */
final class ListChecks {

    /**
     * Upper bound on nodes visited by invariant checks, so a corrupted (cyclic) list produces a
     * violation instead of an infinite loop.
     */
    static final int MAX_CHECK_STEPS = 50_000_000;

    /** Sentinel kinds: head sorts before every element and tail after. */
    static final int HEAD = -1;
    static final int ITEM = 0;
    static final int TAIL = 1;

    private ListChecks() {}

    static <E> E requireItem(E item) {
        return Objects.requireNonNull(item, "null elements are not supported");
    }

    /** Compares a node (described by its kind and item) with an element. */
    static <E extends Comparable<? super E>> int compare(int kind, E nodeItem, E item) {
        return kind != ITEM ? kind : nodeItem.compareTo(item);
    }

    /** Compares two nodes, treating sentinels as minus and plus infinity. */
    static <E extends Comparable<? super E>> int compareNodes(int kindA, E itemA, int kindB, E itemB) {
        if (kindA != ITEM || kindB != ITEM) {
            return Integer.compare(kindA, kindB);
        }
        return itemA.compareTo(itemB);
    }

    /** Records a violation if {@code previous} does not sort strictly before {@code current}. */
    static <E extends Comparable<? super E>> void checkOrder(E previous, E current, List<String> violations) {
        if (previous != null && previous.compareTo(current) >= 0) {
            violations.add("order violated: " + previous + " is followed by " + current);
        }
    }
}
