package io.lockscope.bench;

import io.lockscope.correctness.Work;
import io.lockscope.lock.LockType;
import io.lockscope.set.SetType;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * A validated benchmark configuration. Construction fails with {@link IllegalArgumentException}
 * and a readable message for any invalid or unsafe value.
 *
 * @param kind {@code lock} or {@code set}
 * @param profile name of the workload profile this came from, or {@code custom}
 * @param algorithms lock or set identifiers
 * @param threadCounts thread counts to measure, ascending
 * @param mode {@code thrpt} or {@code sample}
 * @param forks JMH forks per point; 0 runs in-process, which is only suitable for smoke tests
 */
public record BenchmarkRequest(
        String kind,
        String profile,
        List<String> algorithms,
        List<Integer> threadCounts,
        int criticalWork,
        int nonCriticalWork,
        int keyRange,
        int readPercent,
        String mode,
        int forks,
        int warmupIterations,
        int warmupMillis,
        int measurementIterations,
        int measurementMillis,
        boolean gcProfiler) {

    public static final int MAX_FORKS = 5;
    public static final int MAX_ITERATIONS = 50;
    public static final int MIN_ITERATION_MILLIS = 100;
    public static final int MAX_ITERATION_MILLIS = 10_000;
    public static final int MAX_KEY_RANGE = 65_536;
    /** Upper bound on the estimated wall-clock time of one request. */
    public static final long MAX_ESTIMATED_SECONDS = 4 * 3600;

    public static int maxThreads() {
        return Math.max(4, Math.min(256, Runtime.getRuntime().availableProcessors() * 4));
    }

    public BenchmarkRequest {
        kind = require(kind, "kind").toLowerCase(Locale.ROOT);
        if (!kind.equals("lock") && !kind.equals("set")) {
            throw new IllegalArgumentException("kind must be 'lock' or 'set'");
        }
        profile = profile == null || profile.isBlank() ? "custom" : profile;
        if (algorithms == null || algorithms.isEmpty()) {
            throw new IllegalArgumentException("select at least one algorithm");
        }
        List<String> normalized = new ArrayList<>();
        for (String id : algorithms) {
            if (kind.equals("lock")) {
                LockType type = LockType.fromId(id);
                if (type.category() == LockType.Category.CONTROL) {
                    throw new IllegalArgumentException("'" + id + "' is a correctness control, not a lock; "
                            + "it cannot be benchmarked");
                }
                normalized.add(type.id());
            } else {
                normalized.add(SetType.fromId(id).id());
            }
        }
        if (normalized.stream().distinct().count() != normalized.size()) {
            throw new IllegalArgumentException("algorithms contains duplicates");
        }
        algorithms = List.copyOf(normalized);
        if (threadCounts == null || threadCounts.isEmpty()) {
            throw new IllegalArgumentException("select at least one thread count");
        }
        for (int t : threadCounts) {
            if (t < 1 || t > maxThreads()) {
                throw new IllegalArgumentException("thread counts must be in [1, " + maxThreads()
                        + "] on this machine, got " + t);
            }
        }
        threadCounts = threadCounts.stream().distinct().sorted().toList();
        range("criticalWork", criticalWork, 0, Work.MAX_UNITS);
        range("nonCriticalWork", nonCriticalWork, 0, Work.MAX_UNITS);
        range("keyRange", keyRange, 1, MAX_KEY_RANGE);
        range("readPercent", readPercent, 0, 100);
        mode = require(mode, "mode").toLowerCase(Locale.ROOT);
        if (!mode.equals("thrpt") && !mode.equals("sample")) {
            throw new IllegalArgumentException("mode must be 'thrpt' or 'sample'");
        }
        range("forks", forks, 0, MAX_FORKS);
        range("warmupIterations", warmupIterations, 0, MAX_ITERATIONS);
        range("measurementIterations", measurementIterations, 1, MAX_ITERATIONS);
        range("warmupMillis", warmupMillis, MIN_ITERATION_MILLIS, MAX_ITERATION_MILLIS);
        range("measurementMillis", measurementMillis, MIN_ITERATION_MILLIS, MAX_ITERATION_MILLIS);
        long estimate = estimateSeconds(algorithms.size(), threadCounts.size(), forks, warmupIterations, warmupMillis,
                measurementIterations, measurementMillis);
        if (estimate > MAX_ESTIMATED_SECONDS) {
            throw new IllegalArgumentException("this configuration would run for about " + estimate / 60
                    + " minutes; the limit is " + MAX_ESTIMATED_SECONDS / 60 + " minutes");
        }
    }

    /** Number of (algorithm, thread count) points. */
    public int points() {
        return algorithms.size() * threadCounts.size();
    }

    /** Rough wall-clock estimate, including about 1.5 s of JVM start-up per fork. */
    public long estimatedSeconds() {
        return estimateSeconds(algorithms.size(), threadCounts.size(), forks, warmupIterations, warmupMillis,
                measurementIterations, measurementMillis);
    }

    private static long estimateSeconds(int algorithms, int threadCounts, int forks, int wi, int wms, int mi, int mms) {
        long perFork = (long) wi * wms + (long) mi * mms + 1_500;
        return algorithms * (long) threadCounts * Math.max(1, forks) * perFork / 1000;
    }

    private static String require(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required");
        }
        return value.trim();
    }

    private static void range(String name, long value, long min, long max) {
        if (value < min || value > max) {
            throw new IllegalArgumentException(name + " must be in [" + min + ", " + max + "], got " + value);
        }
    }
}
