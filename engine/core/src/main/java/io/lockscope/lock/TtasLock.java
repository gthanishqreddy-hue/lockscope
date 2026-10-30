package io.lockscope.lock;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Test-and-test-and-set spin lock.
 *
 * <p>Waiting threads spin on a volatile read, which is served from their own cache while the lock
 * stays held, and attempt the atomic {@code getAndSet} only once the lock looks free. Observing
 * "free" and acquiring are two separate steps, so another thread can win in between. That race
 * is harmless: the {@code getAndSet} result alone decides ownership, and the loser goes back to
 * reading. When the lock is released, every reader misses at once and they all race to
 * {@code getAndSet}, a burst of coherence traffic proportional to the number of waiters.
 *
 * <p>Memory ordering is the same as {@link TasLock}: ownership is decided by the volatile
 * {@code getAndSet}, which synchronizes-with the previous owner's volatile {@code set(false)}.
 */
public final class TtasLock extends AbstractOwnedLock {

    private static final LockProperties PROPERTIES = new LockProperties(
            false, false, false, LockProperties.Fairness.NONE, LockProperties.Waiting.SPIN_READ, "O(L)");

    private final AtomicBoolean state = new AtomicBoolean(false);

    @Override
    public void lock() {
        checkNotOwner();
        while (true) {
            while (state.get()) {
                Thread.onSpinWait();
            }
            if (!state.getAndSet(true)) {
                break;
            }
        }
        setOwner();
    }

    @Override
    public void unlock() {
        checkAndClearOwner();
        state.set(false);
    }

    @Override
    public LockProperties properties() {
        return PROPERTIES;
    }
}
