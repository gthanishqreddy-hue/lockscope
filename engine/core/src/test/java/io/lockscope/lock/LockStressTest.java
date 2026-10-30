package io.lockscope.lock;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.lockscope.StressLevel;
import io.lockscope.correctness.CheckResult;
import io.lockscope.correctness.LockChecks;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/** Contended correctness checks through the same harness the stress runner uses. */
class LockStressTest {

    static java.util.List<LockType> realLocks() {
        return LockType.realLocks();
    }

    private static LockChecks.Config config(int threads, long iterations, int work) {
        return new LockChecks.Config(threads, StressLevel.scale(iterations), work, 120_000);
    }

    @ParameterizedTest
    @MethodSource("realLocks")
    void noLostUpdatesUnderContention(LockType type) {
        CheckResult result = LockChecks.lostUpdate(type.id(), type.create(),
                config(StressLevel.threads(), 50_000, 5), 7, false);
        assertEquals(CheckResult.Status.PASSED, result.status(), result.diagnostics().toString());
        assertEquals(result.metrics().get("expectedCount"), result.metrics().get("observedCount"));
    }

    @ParameterizedTest
    @MethodSource("realLocks")
    void noOverlappingOwners(LockType type) {
        CheckResult result = LockChecks.mutualExclusion(type.id(), type.create(),
                config(StressLevel.threads(), 50_000, 5), 11, false);
        assertEquals(CheckResult.Status.PASSED, result.status(), result.diagnostics().toString());
        assertEquals(0L, result.metrics().get("overlappingEntries"));
    }

    /**
     * Every lock must stay correct and keep making progress with more threads than CPUs. This
     * asserts progress, not speed: FIFO spin locks (CLH, MCS) convoy when the next thread in line is
     * descheduled, and on Windows they were measured as low as ~65 hand-offs per second (one per
     * 15.6 ms scheduler tick) with 2x oversubscription. 25 acquisitions per thread finish within the
     * deadline even at that rate, so a timeout here still means no progress at all.
     */
    @ParameterizedTest
    @MethodSource("realLocks")
    void oversubscribedThreadsStillMakeProgress(LockType type) {
        int threads = Runtime.getRuntime().availableProcessors() * 2;
        CheckResult result = LockChecks.lostUpdate(type.id(), type.create(),
                new LockChecks.Config(threads, 25, 0, 120_000), 3, false);
        assertEquals(CheckResult.Status.PASSED, result.status(), result.diagnostics().toString());
    }

    /** The harness must catch a lock that provides no exclusion; otherwise it proves nothing. */
    @RepeatedTest(3)
    void negativeControlIsDetected() {
        LockChecks.Config config = new LockChecks.Config(StressLevel.threads(), 200_000, 20, 60_000);
        CheckResult lost = LockChecks.lostUpdate("none", new NoLock(), config, 1, true);
        CheckResult overlap = LockChecks.mutualExclusion("none", new NoLock(), config, 1, true);
        assertEquals(CheckResult.Status.FAILED, lost.status());
        assertEquals(CheckResult.FailureCategory.LOST_UPDATE, lost.failureCategory());
        assertTrue(lost.asExpected());
        assertEquals(CheckResult.Status.FAILED, overlap.status());
        assertEquals(CheckResult.FailureCategory.MUTUAL_EXCLUSION_VIOLATION, overlap.failureCategory());
    }

    @Test
    void invalidConfigurationIsRejected() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new LockChecks.Config(0, 10, 0, 1000));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new LockChecks.Config(10_000, 10, 0, 1000));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> new LockChecks.Config(2, 10, -1, 1000));
    }

    /** A lock that never releases must be reported as a timeout, not hang the suite. */
    @Test
    void deadlockIsReportedAsTimeout() {
        // Blocks instead of spinning so the stuck workers can be released after the assertion.
        java.util.concurrent.CountDownLatch gate = new java.util.concurrent.CountDownLatch(1);
        MutexLock stuck = new MutexLock() {
            @Override
            public void lock() {
                try {
                    gate.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }

            @Override
            public void unlock() {}

            @Override
            public LockProperties properties() {
                return new NoLock().properties();
            }
        };
        try {
            CheckResult result = LockChecks.lostUpdate("stuck", stuck, new LockChecks.Config(2, 10, 0, 300), 1, false);
            assertEquals(CheckResult.Status.TIMEOUT, result.status());
            assertEquals(CheckResult.FailureCategory.TIMEOUT, result.failureCategory());
        } finally {
            gate.countDown();
        }
    }
}
