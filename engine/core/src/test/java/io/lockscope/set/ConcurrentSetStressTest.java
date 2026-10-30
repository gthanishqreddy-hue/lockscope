package io.lockscope.set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.lockscope.StressLevel;
import io.lockscope.correctness.CheckResult;
import io.lockscope.correctness.SetChecks;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/** Concurrent checks of every set through the same harness the stress runner uses. */
class ConcurrentSetStressTest {

    private static SetChecks.Config config(long ops, int keys, int readPercent) {
        return new SetChecks.Config(StressLevel.threads(), StressLevel.scale(ops), keys, readPercent, 120_000);
    }

    @ParameterizedTest
    @EnumSource(SetType.class)
    void everyResultMatchesThePartitionedReference(SetType type) {
        CheckResult result = SetChecks.partitionedReference(type.id(), type::create, config(30_000, 512, 34), 5);
        assertEquals(CheckResult.Status.PASSED, result.status(), result.diagnostics().toString());
    }

    @ParameterizedTest
    @EnumSource(SetType.class)
    void successfulUpdatesAreConservedUnderHighContention(SetType type) {
        CheckResult result = SetChecks.conservation(type.id(), type::create, config(30_000, 32, 20), 9);
        assertEquals(CheckResult.Status.PASSED, result.status(), result.diagnostics().toString());
    }

    @ParameterizedTest
    @EnumSource(SetType.class)
    void successfulUpdatesAreConservedOnALargerList(SetType type) {
        CheckResult result = SetChecks.conservation(type.id(), type::create, config(20_000, 2_048, 80), 13);
        assertEquals(CheckResult.Status.PASSED, result.status(), result.diagnostics().toString());
    }

    @ParameterizedTest
    @EnumSource(SetType.class)
    void shortHistoriesAreLinearizable(SetType type) {
        SetChecks.Config linConfig = new SetChecks.Config(4, 8, 3, 30, 120_000);
        CheckResult result = SetChecks.linearizability(type.id(), type::create, linConfig, 21,
                (int) StressLevel.scale(400));
        assertEquals(CheckResult.Status.PASSED, result.status(), String.join("\n", result.diagnostics()));
        assertTrue(result.metrics().get("historiesChecked") > 0);
    }

    /** The checks must catch an unsynchronized list. */
    @Test
    void negativeControlIsDetected() {
        CheckResult conservation = SetChecks.conservation("unsynchronized", UnsynchronizedList::new,
                new SetChecks.Config(StressLevel.threads(), 50_000, 16, 0, 60_000), 3);
        assertNotEquals(CheckResult.Status.PASSED, conservation.status(),
                "conservation check failed to detect the unsynchronized list");
    }

    @Test
    void linearizabilityCheckDetectsTheNegativeControl() {
        CheckResult result = SetChecks.linearizability("unsynchronized", UnsynchronizedList::new,
                new SetChecks.Config(4, 12, 2, 20, 60_000), 1, 3_000);
        assertEquals(CheckResult.Status.FAILED, result.status(), "checker missed the unsynchronized list");
        assertEquals(CheckResult.FailureCategory.NOT_LINEARIZABLE, result.failureCategory());
    }
}
