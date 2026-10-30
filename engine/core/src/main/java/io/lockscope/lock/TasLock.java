package io.lockscope.lock;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Test-and-set spin lock.
 *
 * <p>Every acquisition attempt is an atomic {@code getAndSet(true)}. On a cache-coherent
 * multiprocessor each attempt needs the cache line in exclusive state, so waiting threads keep
 * taking the line from each other (and from the owner, who must write it to release). This
 * coherence traffic is why TAS degrades quickly as threads are added.
 *
 * <p>Memory ordering: {@code getAndSet} has volatile read and write semantics and
 * {@code set(false)} is a volatile write. The successful {@code getAndSet} reads the value written
 * by the previous owner's {@code set(false)}, so the previous critical section happens-before the
 * next one (JLS 17.4.4: a volatile write synchronizes-with every later read of that write).
 */
public final class TasLock extends AbstractOwnedLock {

    private static final LockProperties PROPERTIES = new LockProperties(
            false, false, false, LockProperties.Fairness.NONE, LockProperties.Waiting.SPIN_RMW, "O(L)");

    private final AtomicBoolean state = new AtomicBoolean(false);

    @Override
    public void lock() {
        checkNotOwner();
        while (state.getAndSet(true)) {
            Thread.onSpinWait();
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
