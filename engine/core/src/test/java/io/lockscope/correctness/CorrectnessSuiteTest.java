package io.lockscope.correctness;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class CorrectnessSuiteTest {

    private static CorrectnessSuite.Config small(CorrectnessSuite.Target target, List<String> algorithms) {
        return new CorrectnessSuite.Config(target, algorithms, 4, 5_000, 2, 99, 2, 64, 50, 50, 6, 3, 60_000);
    }

    @Test
    void lockSuiteRunsEveryCheckAndFlagsTheControl() {
        CorrectnessSuite.Config config = small(CorrectnessSuite.Target.LOCKS, List.of("ttas", "none"));
        List<CheckResult> streamed = new ArrayList<>();
        List<CheckResult> results = CorrectnessSuite.run(config, () -> false, streamed::add);
        assertEquals(config.totalChecks(), results.size());
        assertEquals(results, streamed);
        results.stream().filter(r -> r.algorithm().equals("ttas"))
                .forEach(r -> assertEquals(CheckResult.Status.PASSED, r.status(), r.diagnostics().toString()));
        assertTrue(results.stream().filter(r -> r.algorithm().equals("none")).allMatch(CheckResult::negativeControl));
        // Seeds advance per run so runs are distinct but reproducible.
        assertEquals(List.of(99L, 99L, 99L, 99L, 100L, 100L, 100L, 100L),
                results.stream().map(CheckResult::seed).toList());
    }

    @Test
    void setSuiteRunsThreeChecksPerAlgorithmAndRun() {
        CorrectnessSuite.Config config = small(CorrectnessSuite.Target.SETS, List.of("lazy"));
        List<CheckResult> results = CorrectnessSuite.run(config, () -> false, r -> {});
        assertEquals(6, results.size());
        results.forEach(r -> assertEquals(CheckResult.Status.PASSED, r.status(), r.diagnostics().toString()));
    }

    @Test
    void cancellationStopsBetweenChecks() {
        CorrectnessSuite.Config config = small(CorrectnessSuite.Target.LOCKS, List.of("tas", "ttas"));
        AtomicInteger seen = new AtomicInteger();
        List<CheckResult> results = CorrectnessSuite.run(config, () -> seen.get() >= 3, r -> seen.incrementAndGet());
        assertEquals(3, results.size());
    }

    @Test
    void invalidConfigurationsAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> small(CorrectnessSuite.Target.LOCKS, List.of()));
        assertThrows(IllegalArgumentException.class, () -> small(CorrectnessSuite.Target.LOCKS, List.of("lazy")));
        assertThrows(IllegalArgumentException.class, () -> small(CorrectnessSuite.Target.SETS, List.of("tas")));
        assertThrows(IllegalArgumentException.class, () -> new CorrectnessSuite.Config(
                CorrectnessSuite.Target.SETS, List.of("lazy"), 64, 10, 1, 1, 0, 10, 50, 10, 8, 3, 1000));
        assertThrows(IllegalArgumentException.class, () -> new CorrectnessSuite.Config(
                CorrectnessSuite.Target.LOCKS, List.of("tas"), 2, 10, 0, 1, 0, 10, 50, 10, 8, 3, 1000));
    }
}
