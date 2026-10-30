package io.lockscope.set;

/**
 * Design-level guarantees of a concurrent set implementation (claims, not measurements).
 *
 * @param updateProgress progress guarantee of {@code add} and {@code remove}
 * @param containsProgress progress guarantee of {@code contains}
 * @param synchronization one-line description of the synchronization scheme
 * @param exactSize whether {@code size()} and {@code snapshot()} are linearizable
 */
public record SetProperties(
        Progress updateProgress, Progress containsProgress, String synchronization, boolean exactSize) {

    /** Progress guarantee of an operation. */
    public enum Progress {
        /** Uses locks: a thread descheduled while holding a lock can stop others. */
        BLOCKING,
        /** Some thread always completes an operation in a finite number of steps. */
        LOCK_FREE,
        /** Every thread completes its operation in a finite number of its own steps. */
        WAIT_FREE
    }
}
