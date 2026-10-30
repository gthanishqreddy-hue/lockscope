package io.lockscope.bench.model;

import java.util.List;
import java.util.Map;

/**
 * A benchmark result file, schema {@value #SCHEMA}. The TypeScript mirror of this schema lives in
 * {@code frontend/src/schemas/results.ts}; keep the two in sync.
 *
 * @param origin {@code local-engine} when produced by this engine; the bundled frontend datasets
 *     are rewritten to {@code bundled-sample} by {@code scripts/export-results}
 */
public record BenchmarkReport(
        String schema,
        String id,
        String createdAt,
        String origin,
        String title,
        String kind,
        EnvironmentInfo environment,
        Methodology methodology,
        Workload workload,
        List<Measurement> measurements,
        List<String> warnings,
        String reproduceCommand) {

    public static final String SCHEMA = "lockscope.benchmark/v1";

    /**
     * @param tool always {@code jmh}
     * @param mode {@code thrpt} (operations per time unit) or {@code sample} (sampled latency)
     * @param scoreUnit unit of {@link Measurement#score()}, as reported by JMH
     * @param errorDefinition what {@link Measurement#scoreError()} means
     */
    public record Methodology(
            String tool,
            String mode,
            String scoreUnit,
            int forks,
            int warmupIterations,
            int warmupMillis,
            int measurementIterations,
            int measurementMillis,
            boolean gcProfiler,
            String errorDefinition) {}

    /**
     * Workload shared by every measurement in the file. Lock fields are null for set benchmarks
     * and vice versa.
     */
    public record Workload(
            String profile,
            Integer criticalWork,
            Integer nonCriticalWork,
            Integer keyRange,
            Integer readPercent,
            List<Integer> threadCounts) {}

    /**
     * One (algorithm, thread count) point.
     *
     * @param score JMH primary score: mean over all measurement iterations of all forks
     * @param scoreError half-width of the 99.9% confidence interval (NaN when JMH cannot compute it)
     * @param iterationScores the individual measurement-iteration scores behind {@code score}
     * @param percentiles only in {@code sample} mode, keyed {@code p50}, {@code p90}, {@code p99},
     *     {@code p99.9}, {@code max}; null otherwise because throughput mode does not record latency
     * @param allocBytesPerOp normalized allocation rate from the GC profiler, null if not measured
     */
    public record Measurement(
            String algorithm,
            int threads,
            double score,
            Double scoreError,
            String unit,
            long sampleCount,
            double min,
            double max,
            Double stdev,
            List<Double> iterationScores,
            Map<String, Double> percentiles,
            Double allocBytesPerOp) {}
}
