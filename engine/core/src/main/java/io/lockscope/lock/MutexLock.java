package io.lockscope.lock;

/**
 * A mutual-exclusion lock with the minimal contract studied in LockScope.
 *
 * <p>This intentionally does not implement {@link java.util.concurrent.locks.Lock}: the textbook
 * spin and queue locks here do not support interruption, timed acquisition or conditions, and
 * implementing that interface would advertise capabilities they do not have. What each
 * implementation does support is described by {@link #properties()}.
 *
 * <h2>Contract</h2>
 * <ul>
 *   <li>{@link #lock()} waits (spins or parks, see {@link LockProperties#waiting()}) until the
 *       calling thread owns the lock.
 *   <li>{@link #unlock()} must be called by the owning thread. Calling it from a thread that does
 *       not own the lock throws {@link IllegalMonitorStateException} and leaves the lock unchanged.
 *   <li>Memory visibility: everything the owner did before {@code unlock()} happens-before
 *       everything the next owner does after its {@code lock()} returns.
 *   <li>Non-reentrant implementations throw {@link IllegalMonitorStateException} when the owner
 *       calls {@code lock()} again, instead of deadlocking on itself.
 * </ul>
 */
public interface MutexLock {

    /** Acquires the lock, waiting as long as necessary. Not interruptible unless stated. */
    void lock();

    /** Releases the lock. Must be called by the owning thread. */
    void unlock();

    /** Static description of the guarantees this implementation provides. */
    LockProperties properties();
}
