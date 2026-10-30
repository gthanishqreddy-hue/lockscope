package io.lockscope.bench;

import io.lockscope.bench.jmh.LockBenchmark;
import io.lockscope.bench.jmh.SetBenchmark;
import io.lockscope.bench.model.BenchmarkReport;
import io.lockscope.bench.model.BenchmarkReport.Measurement;
import io.lockscope.bench.model.EnvironmentInfo;
import java.io.PrintStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.regex.Pattern;
import org.openjdk.jmh.profile.GCProfiler;
import org.openjdk.jmh.results.BenchmarkResult;
import org.openjdk.jmh.results.IterationResult;
import org.openjdk.jmh.results.Result;
import org.openjdk.jmh.results.RunResult;
import org.openjdk.jmh.runner.Runner;
import org.openjdk.jmh.runner.RunnerException;
import org.openjdk.jmh.runner.format.OutputFormatFactory;
import org.openjdk.jmh.runner.options.ChainedOptionsBuilder;
import org.openjdk.jmh.runner.options.OptionsBuilder;
import org.openjdk.jmh.runner.options.TimeValue;
import org.openjdk.jmh.runner.options.VerboseMode;
import org.openjdk.jmh.annotations.Mode;
import org.openjdk.jmh.util.Statistics;

/**
 * Runs a {@link BenchmarkRequest} through JMH, one (algorithm, thread count) point at a time, and
 * converts the results into a {@link BenchmarkReport}. Shared by the CLI and the local API.
 */
public final class BenchmarkService {

    /** Receives progress events; all callbacks happen on the calling thread. */
    public interface Listener {
        default void pointStarted(int index, int total, String algorithm, int threads) {}

        default void pointFinished(int index, int total, Measurement measurement) {}
    }

    /** Thrown when JMH fails to run a point. */
    public static final class BenchmarkFailedException extends Exception {
        private static final long serialVersionUID = 1L;

        BenchmarkFailedException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private static final double HIGH_VARIABILITY = 0.10;

    private BenchmarkService() {}

    /**
     * Runs every point. When {@code cancelled} becomes true, stops before the next point and
     * returns a report of the completed points with a warning.
     *
     * @param jmhOutput where JMH's own progress log goes, or null to silence it
     */
    public static BenchmarkReport run(BenchmarkRequest request, Listener listener, BooleanSupplier cancelled,
            PrintStream jmhOutput) throws BenchmarkFailedException {
        EnvironmentInfo environment = EnvironmentInfo.capture();
        List<Measurement> measurements = new ArrayList<>();
        List<String> warnings = new ArrayList<>(staticWarnings(request, environment));
        int total = request.points();
        int index = 0;
        boolean wasCancelled = false;
        outer:
        for (String algorithm : request.algorithms()) {
            for (int threads : request.threadCounts()) {
                if (cancelled.getAsBoolean()) {
                    wasCancelled = true;
                    break outer;
                }
                listener.pointStarted(index, total, algorithm, threads);
                Measurement m = runPoint(request, algorithm, threads, jmhOutput);
                measurements.add(m);
                if (m.scoreError() != null && m.score() > 0 && m.scoreError() / m.score() > HIGH_VARIABILITY) {
                    warnings.add(String.format("High variability for %s at %d threads: +/-%.0f%% (99.9%% CI). "
                            + "Treat differences smaller than this as noise.", algorithm, threads,
                            100 * m.scoreError() / m.score()));
                }
                listener.pointFinished(index, total, m);
                index++;
            }
        }
        if (wasCancelled) {
            warnings.add(0, "Cancelled after " + measurements.size() + " of " + total + " points; "
                    + "this report is incomplete.");
        }
        String createdAt = Instant.now().toString();
        boolean sample = request.mode().equals("sample");
        BenchmarkReport.Methodology methodology = new BenchmarkReport.Methodology("jmh", request.mode(),
                sample ? "ns/op" : "ops/us", request.forks(), request.warmupIterations(), request.warmupMillis(),
                request.measurementIterations(), request.measurementMillis(), request.gcProfiler(),
                "Half-width of the 99.9% confidence interval of the mean across measurement iterations "
                        + "(Student's t), as computed by JMH");
        boolean lock = request.kind().equals("lock");
        BenchmarkReport.Workload workload = new BenchmarkReport.Workload(request.profile(),
                lock ? request.criticalWork() : null, lock ? request.nonCriticalWork() : null,
                lock ? null : request.keyRange(), lock ? null : request.readPercent(), request.threadCounts());
        return new BenchmarkReport(BenchmarkReport.SCHEMA, Ids.newId("bench"), createdAt, "local-engine",
                title(request), request.kind(), environment, methodology, workload, measurements, warnings,
                reproduceCommand(request));
    }

    static Measurement runPoint(BenchmarkRequest request, String algorithm, int threads, PrintStream jmhOutput)
            throws BenchmarkFailedException {
        boolean lock = request.kind().equals("lock");
        boolean sample = request.mode().equals("sample");
        ChainedOptionsBuilder options = new OptionsBuilder()
                .threads(threads)
                .forks(request.forks())
                .warmupIterations(request.warmupIterations())
                .warmupTime(TimeValue.milliseconds(request.warmupMillis()))
                .measurementIterations(request.measurementIterations())
                .measurementTime(TimeValue.milliseconds(request.measurementMillis()))
                .mode(sample ? Mode.SampleTime : Mode.Throughput)
                .timeUnit(sample ? TimeUnit.NANOSECONDS : TimeUnit.MICROSECONDS)
                .shouldFailOnError(true)
                .jvmArgsAppend("-Xms512m", "-Xmx1g");
        if (lock) {
            options.include("^" + Pattern.quote(LockBenchmark.class.getName()) + "\\.acquireRelease$")
                    .param("lock", algorithm)
                    .param("criticalWork", String.valueOf(request.criticalWork()))
                    .param("nonCriticalWork", String.valueOf(request.nonCriticalWork()));
        } else {
            options.include("^" + Pattern.quote(SetBenchmark.class.getName()) + "\\.mixedOperation$")
                    .param("set", algorithm)
                    .param("keyRange", String.valueOf(request.keyRange()))
                    .param("readPercent", String.valueOf(request.readPercent()));
        }
        if (request.gcProfiler()) {
            options.addProfiler(GCProfiler.class);
        }
        PrintStream out = jmhOutput != null ? jmhOutput : new PrintStream(PrintStream.nullOutputStream());
        Runner runner = new Runner(options.build(),
                OutputFormatFactory.createFormatInstance(out, jmhOutput != null ? VerboseMode.NORMAL : VerboseMode.SILENT));
        Collection<RunResult> results;
        try {
            results = runner.run();
        } catch (RunnerException e) {
            throw new BenchmarkFailedException("JMH failed for " + algorithm + " at " + threads + " threads: "
                    + e.getMessage(), e);
        }
        if (results.isEmpty()) {
            throw new BenchmarkFailedException("JMH produced no result for " + algorithm + " at " + threads
                    + " threads (benchmark not found or it failed; see the JMH output)", null);
        }
        return toMeasurement(algorithm, threads, results.iterator().next(), sample);
    }

    static Measurement toMeasurement(String algorithm, int threads, RunResult run, boolean sample) {
        Result<?> primary = run.getPrimaryResult();
        Statistics stats = primary.getStatistics();
        List<Double> iterationScores = new ArrayList<>();
        for (BenchmarkResult benchmarkResult : run.getBenchmarkResults()) {
            for (IterationResult iteration : benchmarkResult.getIterationResults()) {
                iterationScores.add(iteration.getPrimaryResult().getScore());
            }
        }
        Map<String, Double> percentiles = null;
        if (sample) {
            percentiles = new LinkedHashMap<>();
            percentiles.put("p50", finite(stats.getPercentile(50)));
            percentiles.put("p90", finite(stats.getPercentile(90)));
            percentiles.put("p99", finite(stats.getPercentile(99)));
            percentiles.put("p99.9", finite(stats.getPercentile(99.9)));
            percentiles.put("max", finite(stats.getMax()));
            percentiles.values().removeIf(v -> v == null);
        }
        Double alloc = null;
        for (Map.Entry<String, Result> entry : run.getSecondaryResults().entrySet()) {
            if (entry.getKey().endsWith("gc.alloc.rate.norm")) {
                alloc = finite(entry.getValue().getScore());
            }
        }
        return new Measurement(algorithm, threads, primary.getScore(), finite(primary.getScoreError()),
                primary.getScoreUnit(), stats.getN(), stats.getMin(), stats.getMax(),
                finite(stats.getStandardDeviation()), iterationScores, percentiles, alloc);
    }

    static List<String> staticWarnings(BenchmarkRequest request, EnvironmentInfo environment) {
        List<String> warnings = new ArrayList<>();
        if (request.forks() == 0) {
            warnings.add("Ran in-process (forks=0): benchmarks share one JVM and its JIT profile. "
                    + "Use for smoke tests only, not for comparisons.");
        }
        int cpus = environment.availableProcessors();
        int maxThreads = request.threadCounts().get(request.threadCounts().size() - 1);
        if (maxThreads > cpus) {
            warnings.add("Up to " + maxThreads + " threads on " + cpus + " available processors: spin locks "
                    + "degrade sharply when waiting threads are descheduled, so these points measure OS "
                    + "scheduling as much as the algorithm.");
        }
        if ((long) Math.max(1, request.forks()) * request.measurementIterations() < 5) {
            warnings.add("Fewer than 5 measurement iterations in total: confidence intervals are wide "
                    + "or undefined.");
        }
        if (request.warmupIterations() == 0) {
            warnings.add("No warm-up iterations: early measurements include JIT compilation.");
        }
        return warnings;
    }

    static String title(BenchmarkRequest request) {
        String what = request.kind().equals("lock") ? "Lock" : "Concurrent set";
        return what + " benchmark (" + request.profile() + ", " + request.mode() + ")";
    }

    /** Command that reruns the same configuration from the repository root. */
    public static String reproduceCommand(BenchmarkRequest r) {
        StringBuilder args = new StringBuilder("bench --kind ").append(r.kind())
                .append(" --profile ").append(r.profile())
                .append(" --algorithms ").append(String.join(",", r.algorithms()))
                .append(" --threads ").append(String.join(",", r.threadCounts().stream().map(String::valueOf).toList()));
        if (r.kind().equals("lock")) {
            args.append(" --cs-work ").append(r.criticalWork()).append(" --ncs-work ").append(r.nonCriticalWork());
        } else {
            args.append(" --key-range ").append(r.keyRange()).append(" --read-percent ").append(r.readPercent());
        }
        args.append(" --mode ").append(r.mode())
                .append(" --forks ").append(r.forks())
                .append(" --wi ").append(r.warmupIterations()).append(" --wt ").append(r.warmupMillis())
                .append(" --mi ").append(r.measurementIterations()).append(" --mt ").append(r.measurementMillis());
        if (!r.gcProfiler()) {
            args.append(" --no-gc");
        }
        return "cd engine && ./gradlew :bench:run --args=\"" + args + "\"";
    }

    private static Double finite(double value) {
        return Double.isFinite(value) ? value : null;
    }
}
