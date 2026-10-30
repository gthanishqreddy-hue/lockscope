package io.lockscope.bench;

import io.lockscope.bench.model.CorrectnessReport;
import io.lockscope.bench.model.EnvironmentInfo;
import io.lockscope.correctness.CheckResult;
import io.lockscope.correctness.CorrectnessSuite;
import java.time.Instant;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Runs a correctness suite and wraps it in a {@link CorrectnessReport}. */
public final class CorrectnessService {

    private CorrectnessService() {}

    public static CorrectnessReport run(CorrectnessSuite.Config config, BooleanSupplier cancelled,
            Consumer<CheckResult> onResult) {
        long start = System.nanoTime();
        List<CheckResult> results = CorrectnessSuite.run(config, cancelled, onResult);
        long millis = (System.nanoTime() - start) / 1_000_000;
        boolean wasCancelled = results.size() < config.totalChecks();
        return new CorrectnessReport(CorrectnessReport.SCHEMA, Ids.newId("test"), Instant.now().toString(),
                "local-engine", EnvironmentInfo.capture(), config,
                CorrectnessReport.Summary.of(results, millis, wasCancelled), results, reproduceCommand(config),
                CorrectnessReport.LIMITATIONS);
    }

    /** Command that reruns the same configuration (same seeds) from the repository root. */
    public static String reproduceCommand(CorrectnessSuite.Config c) {
        StringBuilder args = new StringBuilder("stress --target ")
                .append(c.target().name().toLowerCase())
                .append(" --algorithms ").append(String.join(",", c.algorithms()))
                .append(" --threads ").append(c.threads())
                .append(" --ops ").append(c.operationsPerThread())
                .append(" --runs ").append(c.runs())
                .append(" --seed ").append(c.seed())
                .append(" --timeout-ms ").append(c.timeoutMillis());
        if (c.target() == CorrectnessSuite.Target.LOCKS) {
            args.append(" --cs-work ").append(c.criticalSectionWork());
        } else {
            args.append(" --key-range ").append(c.keyRange())
                    .append(" --read-percent ").append(c.readPercent())
                    .append(" --lin-histories ").append(c.linearizabilityHistories())
                    .append(" --lin-ops ").append(c.linearizabilityOpsPerThread())
                    .append(" --lin-keys ").append(c.linearizabilityKeys());
        }
        return "cd engine && ./gradlew :bench:run --args=\"" + args + "\"";
    }
}
