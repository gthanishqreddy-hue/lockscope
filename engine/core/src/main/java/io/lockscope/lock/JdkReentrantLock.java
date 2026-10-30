package io.lockscope.lock;

import java.util.concurrent.locks.ReentrantLock;

/**
 * Baseline adapter around {@link ReentrantLock} from the standard library.
 *
 * <p>This is not a textbook algorithm: it is an industrial lock built on
 * {@code AbstractQueuedSynchronizer}, which spins briefly and then parks waiting threads. It is
 * reentrant, and the underlying lock supports interruption, timeouts and conditions, but this
 * adapter only exposes {@link #lock()} and {@link #unlock()}. Use it as a reference point, keeping
 * in mind that it gives up the CPU while waiting whereas the spin locks never do.
 */
public final class JdkReentrantLock implements MutexLock {

    private final ReentrantLock delegate;
    private final LockProperties properties;

    public JdkReentrantLock(boolean fair) {
        this.delegate = new ReentrantLock(fair);
        this.properties = new LockProperties(
                true,
                false, // not exposed through this adapter
                false, // not exposed through this adapter
                fair ? LockProperties.Fairness.FIFO : LockProperties.Fairness.NONE,
                LockProperties.Waiting.PARK,
                "O(L + waiting threads)");
    }

    @Override
    public void lock() {
        delegate.lock();
    }

    /** Throws {@link IllegalMonitorStateException} if the caller does not hold the lock. */
    @Override
    public void unlock() {
        delegate.unlock();
    }

    @Override
    public LockProperties properties() {
        return properties;
    }

    public boolean isFair() {
        return delegate.isFair();
    }
}
