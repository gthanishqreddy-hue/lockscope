package io.lockscope.lock;

import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Test-and-test-and-set lock with randomized exponential backoff.
 *
 * <p>After a failed {@code getAndSet} (the lock looked free but another thread won), the thread
 * waits a uniformly random delay in {@code [0, limit)} ("full jitter") and then doubles
 * {@code limit}, capped at {@code maxDelayNanos}. Backing off spreads out the retry storm that
 * TTAS produces on release. It is a contention-management policy only: correctness (mutual
 * exclusion and visibility) comes entirely from the atomic {@code getAndSet}, exactly as in
 * {@link TtasLock}. Good parameter values depend on the machine and workload.
 *
 * <p>The delay is a timed busy-wait on {@link System#nanoTime()} rather than
 * {@link Thread#sleep(long)}, whose granularity (about 1 ms on Windows) is far coarser than the
 * delays that matter for a lock.
 */
public final class BackoffLock extends AbstractOwnedLock {

    /** Default minimum delay in nanoseconds. */
    public static final long DEFAULT_MIN_DELAY_NANOS = 100;
    /** Default maximum delay in nanoseconds. */
    public static final long DEFAULT_MAX_DELAY_NANOS = 10_000;
    /** Upper bound accepted for {@code maxDelayNanos} (10 ms), to keep runs bounded. */
    public static final long MAX_ALLOWED_DELAY_NANOS = 10_000_000;

    private static final LockProperties PROPERTIES = new LockProperties(
            false, false, false, LockProperties.Fairness.NONE, LockProperties.Waiting.SPIN_BACKOFF, "O(L)");

    private final AtomicBoolean state = new AtomicBoolean(false);
    private final long minDelayNanos;
    private final long maxDelayNanos;

    public BackoffLock() {
        this(DEFAULT_MIN_DELAY_NANOS, DEFAULT_MAX_DELAY_NANOS);
    }

    /**
     * @param minDelayNanos initial backoff limit; must be positive
     * @param maxDelayNanos cap on the backoff limit; must be in
     *     {@code [minDelayNanos, MAX_ALLOWED_DELAY_NANOS]}
     */
    public BackoffLock(long minDelayNanos, long maxDelayNanos) {
        if (minDelayNanos <= 0) {
            throw new IllegalArgumentException("minDelayNanos must be positive, was " + minDelayNanos);
        }
        if (maxDelayNanos < minDelayNanos || maxDelayNanos > MAX_ALLOWED_DELAY_NANOS) {
            throw new IllegalArgumentException("maxDelayNanos must be in [" + minDelayNanos + ", "
                    + MAX_ALLOWED_DELAY_NANOS + "], was " + maxDelayNanos);
        }
        this.minDelayNanos = minDelayNanos;
        this.maxDelayNanos = maxDelayNanos;
    }

    @Override
    public void lock() {
        checkNotOwner();
        long limit = minDelayNanos;
        while (true) {
            while (state.get()) {
                Thread.onSpinWait();
            }
            if (!state.getAndSet(true)) {
                break;
            }
            pause(ThreadLocalRandom.current().nextLong(limit));
            limit = nextLimit(limit, maxDelayNanos);
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

    public long minDelayNanos() {
        return minDelayNanos;
    }

    public long maxDelayNanos() {
        return maxDelayNanos;
    }

    /** Doubles {@code limit} without overflowing, capped at {@code max}. */
    static long nextLimit(long limit, long max) {
        return limit > max / 2 ? max : limit * 2;
    }

    private static void pause(long nanos) {
        if (nanos <= 0) {
            return;
        }
        long deadline = System.nanoTime() + nanos;
        while (System.nanoTime() - deadline < 0) {
            Thread.onSpinWait();
        }
    }
}
