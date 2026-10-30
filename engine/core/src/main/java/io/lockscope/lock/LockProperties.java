package io.lockscope.lock;

/**
 * Capabilities and guarantees of a lock implementation. These are claims about the design, backed
 * by the documentation in {@code docs/algorithms.md}; they are not measured.
 *
 * @param reentrant whether the owner may acquire the lock again without releasing it
 * @param interruptible whether a waiting thread stops waiting when interrupted
 * @param timedAcquire whether acquisition with a timeout is supported
 * @param fairness ordering guarantee among waiting threads
 * @param waiting how a waiting thread spends its time
 * @param space memory used by the lock, in terms of threads {@code n} and locks {@code L}
 */
public record LockProperties(
        boolean reentrant,
        boolean interruptible,
        boolean timedAcquire,
        Fairness fairness,
        Waiting waiting,
        String space) {

    /** Ordering guarantee among threads waiting for the lock. */
    public enum Fairness {
        /** No ordering guarantee; an individual thread can starve under contention. */
        NONE,
        /** First-come-first-served, ordered by the atomic enqueue (the "doorway"). */
        FIFO,
        /** Not a lock: provides no mutual exclusion at all (negative control). */
        NOT_APPLICABLE
    }

    /** How a waiting thread spends its time. */
    public enum Waiting {
        /** Spins with an atomic read-modify-write on every attempt. */
        SPIN_RMW,
        /** Spins reading a shared location; attempts the read-modify-write when it looks free. */
        SPIN_READ,
        /** Like {@link #SPIN_READ}, but waits a randomized, growing delay after failed attempts. */
        SPIN_BACKOFF,
        /** Spins on a location written only by its predecessor in a queue. */
        SPIN_LOCAL,
        /** Spins briefly, then parks the thread in the operating system. */
        PARK,
        /** Never waits (negative control). */
        NONE
    }
}
