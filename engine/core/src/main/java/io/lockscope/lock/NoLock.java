package io.lockscope.lock;

/**
 * Negative control: a "lock" that does nothing.
 *
 * <p>It exists so the correctness harness can prove it is able to detect broken mutual exclusion
 * and lost updates. A harness that reports this lock as correct is itself broken. It is never
 * offered as a benchmark candidate.
 */
public final class NoLock implements MutexLock {

    private static final LockProperties PROPERTIES = new LockProperties(
            false, false, false, LockProperties.Fairness.NOT_APPLICABLE, LockProperties.Waiting.NONE, "O(1)");

    @Override
    public void lock() {
        // Intentionally empty: provides no exclusion.
    }

    @Override
    public void unlock() {
        // Intentionally empty.
    }

    @Override
    public LockProperties properties() {
        return PROPERTIES;
    }
}
