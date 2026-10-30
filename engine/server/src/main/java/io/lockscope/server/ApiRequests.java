package io.lockscope.server;

import io.lockscope.bench.BenchmarkProfiles;
import io.lockscope.bench.BenchmarkRequest;
import io.lockscope.correctness.CorrectnessSuite;
import java.util.List;

/**
 * Request bodies accepted by the API. Every field except the selection is optional and falls back
 * to the named profile (benchmarks) or the suite defaults (correctness). Validation happens in the
 * domain constructors, which throw {@link IllegalArgumentException} with a readable message.
 */
final class ApiRequests {

    /** API-level limits, stricter than the CLI's, because requests come over the network. */
    static final int MAX_API_RUNS = 20;
    static final long MAX_API_TIMEOUT_MILLIS = 10 * 60_000L;

    private ApiRequests() {}

    /** Body of {@code POST /api/v1/experiments}. Exactly one of the two payloads must be set. */
    record CreateExperiment(String type, BenchmarkBody benchmark, CorrectnessBody correctness) {}

    record BenchmarkBody(
            String profile,
            String kind,
            List<String> algorithms,
            List<Integer> threadCounts,
            Integer criticalWork,
            Integer nonCriticalWork,
            Integer keyRange,
            Integer readPercent,
            String mode,
            Integer forks,
            Integer warmupIterations,
            Integer warmupMillis,
            Integer measurementIterations,
            Integer measurementMillis,
            Boolean gcProfiler) {

        BenchmarkRequest toRequest() {
            BenchmarkRequest base = profile != null && !profile.equals("custom")
                    ? BenchmarkProfiles.get(profile).defaults() : null;
            String k = kind != null ? kind : base != null ? base.kind() : null;
            if (k == null) {
                throw new IllegalArgumentException("benchmark.kind or benchmark.profile is required");
            }
            if (base != null && !base.kind().equalsIgnoreCase(k)) {
                throw new IllegalArgumentException("profile " + profile + " is a " + base.kind() + " profile");
            }
            return new BenchmarkRequest(k, profile,
                    pick(algorithms, base == null ? null : base.algorithms(), "benchmark.algorithms"),
                    pick(threadCounts, base == null ? BenchmarkProfiles.defaultThreadSweep() : base.threadCounts(),
                            "benchmark.threadCounts"),
                    pick(criticalWork, base == null ? 10 : base.criticalWork()),
                    pick(nonCriticalWork, base == null ? 0 : base.nonCriticalWork()),
                    pick(keyRange, base == null ? 1024 : base.keyRange()),
                    pick(readPercent, base == null ? 80 : base.readPercent()),
                    mode != null ? mode : "thrpt",
                    pick(forks, base == null ? 2 : base.forks()),
                    pick(warmupIterations, base == null ? 5 : base.warmupIterations()),
                    pick(warmupMillis, base == null ? 1000 : base.warmupMillis()),
                    pick(measurementIterations, base == null ? 5 : base.measurementIterations()),
                    pick(measurementMillis, base == null ? 1000 : base.measurementMillis()),
                    gcProfiler == null || gcProfiler);
        }
    }

    record CorrectnessBody(
            String target,
            List<String> algorithms,
            Integer threads,
            Long operationsPerThread,
            Integer runs,
            Long seed,
            Integer criticalSectionWork,
            Integer keyRange,
            Integer readPercent,
            Integer linearizabilityHistories,
            Integer linearizabilityOpsPerThread,
            Integer linearizabilityKeys,
            Long timeoutMillis) {

        CorrectnessSuite.Config toConfig() {
            if (target == null) {
                throw new IllegalArgumentException("correctness.target is required ('locks' or 'sets')");
            }
            CorrectnessSuite.Target t;
            try {
                t = CorrectnessSuite.Target.fromId(target);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("correctness.target must be 'locks' or 'sets'");
            }
            List<String> selected = pick(algorithms, null, "correctness.algorithms");
            CorrectnessSuite.Config d = CorrectnessSuite.Config.defaults(t, selected);
            int r = pick(runs, d.runs());
            if (r > MAX_API_RUNS) {
                throw new IllegalArgumentException("runs must be at most " + MAX_API_RUNS + " through the API");
            }
            long timeout = timeoutMillis != null ? timeoutMillis : d.timeoutMillis();
            if (timeout > MAX_API_TIMEOUT_MILLIS) {
                throw new IllegalArgumentException("timeoutMillis must be at most " + MAX_API_TIMEOUT_MILLIS);
            }
            int threadCount = pick(threads, d.threads());
            if (threadCount > BenchmarkRequest.maxThreads()) {
                throw new IllegalArgumentException("threads must be at most " + BenchmarkRequest.maxThreads()
                        + " on this machine");
            }
            return new CorrectnessSuite.Config(t, selected, threadCount,
                    operationsPerThread != null ? operationsPerThread : d.operationsPerThread(), r,
                    seed != null ? seed : d.seed(),
                    pick(criticalSectionWork, d.criticalSectionWork()),
                    pick(keyRange, d.keyRange()),
                    pick(readPercent, d.readPercent()),
                    pick(linearizabilityHistories, d.linearizabilityHistories()),
                    pick(linearizabilityOpsPerThread, d.linearizabilityOpsPerThread()),
                    pick(linearizabilityKeys, d.linearizabilityKeys()),
                    timeout);
        }
    }

    private static int pick(Integer value, int fallback) {
        return value != null ? value : fallback;
    }

    private static <T> List<T> pick(List<T> value, List<T> fallback, String name) {
        if (value != null) {
            return value;
        }
        if (fallback == null) {
            throw new IllegalArgumentException(name + " is required");
        }
        return fallback;
    }
}
