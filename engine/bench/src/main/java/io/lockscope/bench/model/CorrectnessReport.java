package io.lockscope.bench.model;

import io.lockscope.correctness.CheckResult;
import io.lockscope.correctness.CorrectnessSuite;
import java.util.List;

/**
 * A correctness-run result file, schema {@value #SCHEMA}. Mirrored in
 * {@code frontend/src/schemas/results.ts}.
 */
public record CorrectnessReport(
        String schema,
        String id,
        String createdAt,
        String origin,
        EnvironmentInfo environment,
        CorrectnessSuite.Config config,
        Summary summary,
        List<CheckResult> results,
        String reproduceCommand,
        List<String> limitations) {

    public static final String SCHEMA = "lockscope.correctness/v1";

    /** Fixed caveats attached to every correctness report. */
    public static final List<String> LIMITATIONS = List.of(
            "Passing checks are evidence for the tested configurations, not a proof of correctness.",
            "The seed reproduces the generated workload; the thread interleaving depends on the OS scheduler "
                    + "and is not reproducible.",
            "The linearizability checker verifies short bounded histories of add/remove/contains only; "
                    + "size() and snapshot() are not checked for linearizability.",
            "Results depend on the hardware memory model: a JMM violation that x86 hardware happens to hide "
                    + "can pass here and fail on ARM.");

    /**
     * @param asExpected true when every real algorithm passed and every negative control was caught
     */
    public record Summary(
            int total,
            int passed,
            int failed,
            int timedOut,
            int errors,
            int controlsDetected,
            int controlsMissed,
            long durationMillis,
            boolean asExpected,
            boolean cancelled) {

        public static Summary of(List<CheckResult> results, long durationMillis, boolean cancelled) {
            int passed = 0;
            int failed = 0;
            int timedOut = 0;
            int errors = 0;
            int controlsDetected = 0;
            int controlsMissed = 0;
            boolean asExpected = true;
            for (CheckResult r : results) {
                if (r.negativeControl()) {
                    if (r.asExpected()) {
                        controlsDetected++;
                    } else {
                        controlsMissed++;
                    }
                } else {
                    switch (r.status()) {
                        case PASSED -> passed++;
                        case FAILED -> failed++;
                        case TIMEOUT -> timedOut++;
                        default -> errors++;
                    }
                }
                asExpected &= r.asExpected();
            }
            return new Summary(results.size(), passed, failed, timedOut, errors, controlsDetected, controlsMissed,
                    durationMillis, asExpected && !cancelled, cancelled);
        }
    }
}
