package io.lockscope.set;

import java.util.Arrays;
import java.util.Locale;
import java.util.function.Supplier;

/** Registry of concurrent set implementations, keyed by a stable identifier. */
public enum SetType {
    COARSE("coarse", "Coarse-grained (one lock)", CoarseList::new),
    FINE("fine", "Fine-grained (hand-over-hand)", FineList::new),
    OPTIMISTIC("optimistic", "Optimistic (validate by re-traversal)", OptimisticList::new),
    LAZY("lazy", "Lazy (logical + physical removal)", LazyList::new),
    LOCK_FREE("lockfree", "Lock-free (Harris-Michael)", LockFreeList::new);

    /** Bump when an implementation changes in a way that makes older measurements incomparable. */
    public static final String IMPLEMENTATION_VERSION = "1";

    private final String id;
    private final String displayName;
    private final Supplier<ConcurrentSet<Integer>> factory;

    SetType(String id, String displayName, Supplier<ConcurrentSet<Integer>> factory) {
        this.id = id;
        this.displayName = displayName;
        this.factory = factory;
    }

    public String id() {
        return id;
    }

    public String displayName() {
        return displayName;
    }

    /** Creates an empty set of integers, the element type used by tests and benchmarks. */
    public ConcurrentSet<Integer> create() {
        return factory.get();
    }

    public static SetType fromId(String id) {
        String wanted = id.trim().toLowerCase(Locale.ROOT);
        for (SetType type : values()) {
            if (type.id.equals(wanted)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown set '" + id + "'. Known: "
                + Arrays.stream(values()).map(SetType::id).toList());
    }
}
