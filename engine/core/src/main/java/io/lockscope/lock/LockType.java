package io.lockscope.lock;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.function.Supplier;

/** Registry of lock implementations, keyed by a stable identifier used in results and the API. */
public enum LockType {
    TAS("tas", "TAS (test-and-set)", Category.TEXTBOOK, TasLock::new),
    TTAS("ttas", "TTAS (test-and-test-and-set)", Category.TEXTBOOK, TtasLock::new),
    BACKOFF("backoff", "TTAS + exponential backoff", Category.TEXTBOOK, BackoffLock::new),
    CLH("clh", "CLH queue lock", Category.TEXTBOOK, ClhLock::new),
    MCS("mcs", "MCS queue lock", Category.TEXTBOOK, McsLock::new),
    JDK_REENTRANT("jdk-reentrant", "java.util.concurrent ReentrantLock (non-fair)", Category.BASELINE,
            () -> new JdkReentrantLock(false)),
    JDK_REENTRANT_FAIR("jdk-reentrant-fair", "java.util.concurrent ReentrantLock (fair)", Category.BASELINE,
            () -> new JdkReentrantLock(true)),
    NONE("none", "No lock (negative control)", Category.CONTROL, NoLock::new);

    /** Where an implementation comes from; affects how it may be compared. */
    public enum Category {
        /** Implemented in LockScope from the textbook algorithm. */
        TEXTBOOK,
        /** Standard-library implementation used as a reference point. */
        BASELINE,
        /** Deliberately incorrect; used to validate the test harness. */
        CONTROL
    }

    /**
     * Version of the implementation recorded in results. Bump when an algorithm changes in a way
     * that makes older measurements incomparable.
     */
    public static final String IMPLEMENTATION_VERSION = "1";

    private final String id;
    private final String displayName;
    private final Category category;
    private final Supplier<MutexLock> factory;

    LockType(String id, String displayName, Category category, Supplier<MutexLock> factory) {
        this.id = id;
        this.displayName = displayName;
        this.category = category;
        this.factory = factory;
    }

    public String id() {
        return id;
    }

    public String displayName() {
        return displayName;
    }

    public Category category() {
        return category;
    }

    public MutexLock create() {
        return factory.get();
    }

    /** Lock types that provide mutual exclusion (everything except the negative control). */
    public static List<LockType> realLocks() {
        return Arrays.stream(values()).filter(t -> t.category != Category.CONTROL).toList();
    }

    /** Looks up a lock type by its identifier, case-insensitively. */
    public static LockType fromId(String id) {
        String wanted = id.trim().toLowerCase(Locale.ROOT);
        for (LockType type : values()) {
            if (type.id.equals(wanted)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown lock '" + id + "'. Known: "
                + Arrays.stream(values()).map(LockType::id).toList());
    }
}
