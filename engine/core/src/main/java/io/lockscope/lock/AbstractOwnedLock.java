package io.lockscope.lock;

/**
 * Shared ownership bookkeeping for the textbook locks.
 *
 * <p>{@code owner} is a plain (non-volatile) field. It is written only by the thread that holds
 * the lock, after acquisition and before release, so those writes are ordered by the lock itself.
 * A thread that does not own the lock may read a stale value, but it can never read a reference
 * to itself unless it wrote that value and has not cleared it yet, because a thread always
 * observes its own most recent write. That is all the two checks below need, so no extra
 * synchronization (which would perturb the measurements) is required.
 */
abstract class AbstractOwnedLock implements MutexLock {

    private Thread owner;

    /** Called at the start of {@code lock()}: rejects re-acquisition by the owner. */
    final void checkNotOwner() {
        if (owner == Thread.currentThread()) {
            throw new IllegalMonitorStateException(
                    getClass().getSimpleName() + " is not reentrant: the owner tried to lock it again");
        }
    }

    /** Called once the lock has been acquired. */
    final void setOwner() {
        owner = Thread.currentThread();
    }

    /** Called at the start of {@code unlock()}: rejects release by a non-owner, then clears. */
    final void checkAndClearOwner() {
        if (owner != Thread.currentThread()) {
            throw new IllegalMonitorStateException(
                    getClass().getSimpleName() + " unlocked by a thread that does not own it");
        }
        owner = null;
    }
}
