package io.lockscope.correctness;

import java.util.List;
import java.util.Map;

/**
 * Result of one run of one correctness check against one algorithm.
 *
 * @param check identifier of the check, for example {@code lock.lost-update}
 * @param algorithm identifier of the lock or set under test
 * @param threads worker threads used
 * @param operationsPerThread operations each worker performed (or was asked to perform)
 * @param seed seed of the generated workload; reproduces the workload, not the thread schedule
 * @param status outcome of the run
 * @param failureCategory why it failed, or {@code null} if it passed
 * @param durationMillis wall-clock duration of the concurrent phase
 * @param metrics check-specific counters (expected and observed values, violation counts, ...)
 * @param diagnostics human-readable details, bounded in length
 * @param negativeControl whether the algorithm is a deliberately broken control that is expected
 *     to fail; a passing control means the check is too weak
 */
public record CheckResult(
        String check,
        String algorithm,
        int threads,
        long operationsPerThread,
        long seed,
        Status status,
        FailureCategory failureCategory,
        long durationMillis,
        Map<String, Long> metrics,
        List<String> diagnostics,
        boolean negativeControl) {

    /** Outcome of a run. */
    public enum Status {
        PASSED,
        FAILED,
        TIMEOUT,
        ERROR,
        CANCELLED
    }

    /** Classification of a failure. */
    public enum FailureCategory {
        MUTUAL_EXCLUSION_VIOLATION,
        LOST_UPDATE,
        INVARIANT_VIOLATION,
        REFERENCE_MISMATCH,
        CONSERVATION_VIOLATION,
        NOT_LINEARIZABLE,
        INCONCLUSIVE,
        TIMEOUT,
        EXCEPTION
    }

    /** Maximum number of diagnostic lines kept per result. */
    public static final int MAX_DIAGNOSTICS = 25;

    public CheckResult {
        metrics = Map.copyOf(metrics);
        diagnostics = List.copyOf(diagnostics.size() > MAX_DIAGNOSTICS
                ? diagnostics.subList(0, MAX_DIAGNOSTICS) : diagnostics);
    }

    /**
     * Whether the run behaved as expected: real algorithms must pass, negative controls must be
     * caught failing a correctness property.
     */
    public boolean asExpected() {
        return negativeControl ? status == Status.FAILED : status == Status.PASSED;
    }
}
