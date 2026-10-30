package io.lockscope.correctness;

import io.lockscope.lock.MutexLock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.LongAdder;

/**
 * Correctness checks for {@link MutexLock} implementations.
 *
 * <p>Two complementary checks are provided because each can mask what the other finds:
 *
 * <ul>
 *   <li><b>Lost update</b> ({@link #lostUpdate}): the critical section is a non-atomic
 *       read-delay-write of a plain {@code long} with no atomics or volatiles inside. Any overlap,
 *       or any missing happens-before edge between consecutive owners, can lose an increment. With
 *       nothing else inside the critical section, the only memory ordering available is the one
 *       the lock provides.
 *   <li><b>Overlap detection</b> ({@link #mutualExclusion}): every entry atomically increments an
 *       occupancy counter and records a violation if anyone else is inside. This catches overlaps
 *       directly, even ones that happen not to lose an update. Its atomic operations are full
 *       fences, which could hide a visibility bug, which is why the lost-update check exists.
 * </ul>
 *
 * <p>Neither check proves correctness: they sample executions, and a passing result is evidence
 * for the tested thread count, machine and duration only.
 */
public final class LockChecks {

    private LockChecks() {}

    /** Configuration shared by both lock checks. */
    public record Config(int threads, long iterationsPerThread, int criticalSectionWork, long timeoutMillis) {
        public Config {
            if (threads < 1 || threads > ConcurrentRunner.MAX_THREADS) {
                throw new IllegalArgumentException("threads must be in [1, " + ConcurrentRunner.MAX_THREADS + "]");
            }
            if (iterationsPerThread < 1 || iterationsPerThread > 100_000_000L) {
                throw new IllegalArgumentException("iterationsPerThread must be in [1, 100000000]");
            }
            if (criticalSectionWork < 0 || criticalSectionWork > Work.MAX_UNITS) {
                throw new IllegalArgumentException("criticalSectionWork must be in [0, " + Work.MAX_UNITS + "]");
            }
            if (timeoutMillis < 1) {
                throw new IllegalArgumentException("timeoutMillis must be positive");
            }
        }
    }

    /** Shared state; {@code counter} is deliberately a plain field. */
    private static final class Shared {
        long counter;
        final AtomicInteger inside = new AtomicInteger();
        final AtomicInteger maxInside = new AtomicInteger();
        final LongAdder overlaps = new LongAdder();
    }

    public static CheckResult lostUpdate(
            String algorithm, MutexLock lock, Config config, long seed, boolean negativeControl) {
        Shared shared = new Shared();
        ConcurrentRunner runner = new ConcurrentRunner();
        ConcurrentRunner.Outcome outcome = runner.run(config.threads(), t -> {
            long local = seed + t;
            for (long i = 0; i < config.iterationsPerThread(); i++) {
                if ((i & 1023) == 0 && runner.aborted()) {
                    return;
                }
                lock.lock();
                try {
                    long value = shared.counter;
                    local = Work.spin(local, config.criticalSectionWork());
                    shared.counter = value + 1;
                } finally {
                    lock.unlock();
                }
            }
            Work.sink = local;
        }, config.timeoutMillis());

        long expected = config.threads() * config.iterationsPerThread();
        Map<String, Long> metrics = new LinkedHashMap<>();
        metrics.put("expectedCount", expected);
        if (outcome.timedOut()) {
            return timeout("lock.lost-update", algorithm, config, seed, outcome, metrics, negativeControl);
        }
        if (outcome.firstError() != null) {
            return error("lock.lost-update", algorithm, config, seed, outcome, metrics, negativeControl);
        }
        // Thread.join (inside the runner) makes the workers' writes visible here.
        long observed = shared.counter;
        metrics.put("observedCount", observed);
        metrics.put("lostUpdates", expected - observed);
        List<String> diagnostics = new ArrayList<>();
        boolean passed = observed == expected;
        if (!passed) {
            diagnostics.add(String.format("counter is %d, expected %d: %d increments were lost",
                    observed, expected, expected - observed));
        }
        return new CheckResult("lock.lost-update", algorithm, config.threads(), config.iterationsPerThread(),
                seed, passed ? CheckResult.Status.PASSED : CheckResult.Status.FAILED,
                passed ? null : CheckResult.FailureCategory.LOST_UPDATE,
                millis(outcome), metrics, diagnostics, negativeControl);
    }

    public static CheckResult mutualExclusion(
            String algorithm, MutexLock lock, Config config, long seed, boolean negativeControl) {
        Shared shared = new Shared();
        ConcurrentRunner runner = new ConcurrentRunner();
        ConcurrentRunner.Outcome outcome = runner.run(config.threads(), t -> {
            long local = seed + t;
            for (long i = 0; i < config.iterationsPerThread(); i++) {
                if ((i & 1023) == 0 && runner.aborted()) {
                    return;
                }
                lock.lock();
                try {
                    int occupants = shared.inside.incrementAndGet();
                    if (occupants != 1) {
                        shared.overlaps.increment();
                        shared.maxInside.accumulateAndGet(occupants, Math::max);
                    }
                    long value = shared.counter;
                    local = Work.spin(local, config.criticalSectionWork());
                    shared.counter = value + 1;
                    shared.inside.decrementAndGet();
                } finally {
                    lock.unlock();
                }
            }
            Work.sink = local;
        }, config.timeoutMillis());

        long expected = config.threads() * config.iterationsPerThread();
        Map<String, Long> metrics = new LinkedHashMap<>();
        metrics.put("expectedEntries", expected);
        if (outcome.timedOut()) {
            return timeout("lock.mutual-exclusion", algorithm, config, seed, outcome, metrics, negativeControl);
        }
        if (outcome.firstError() != null) {
            return error("lock.mutual-exclusion", algorithm, config, seed, outcome, metrics, negativeControl);
        }
        long overlaps = shared.overlaps.sum();
        long observed = shared.counter;
        metrics.put("overlappingEntries", overlaps);
        metrics.put("maxSimultaneousOwners", (long) Math.max(1, shared.maxInside.get()));
        metrics.put("observedCount", observed);
        List<String> diagnostics = new ArrayList<>();
        CheckResult.FailureCategory category = null;
        if (overlaps > 0) {
            category = CheckResult.FailureCategory.MUTUAL_EXCLUSION_VIOLATION;
            diagnostics.add(String.format("%d entries found another thread inside the critical section "
                    + "(up to %d owners at once)", overlaps, shared.maxInside.get()));
        }
        if (observed != expected) {
            if (category == null) {
                category = CheckResult.FailureCategory.LOST_UPDATE;
            }
            diagnostics.add(String.format("counter is %d, expected %d", observed, expected));
        }
        return new CheckResult("lock.mutual-exclusion", algorithm, config.threads(), config.iterationsPerThread(),
                seed, category == null ? CheckResult.Status.PASSED : CheckResult.Status.FAILED, category,
                millis(outcome), metrics, diagnostics, negativeControl);
    }

    static CheckResult timeout(String check, String algorithm, Config config, long seed,
            ConcurrentRunner.Outcome outcome, Map<String, Long> metrics, boolean negativeControl) {
        return new CheckResult(check, algorithm, config.threads(), config.iterationsPerThread(), seed,
                CheckResult.Status.TIMEOUT, CheckResult.FailureCategory.TIMEOUT, millis(outcome), metrics,
                List.of("workers did not finish within " + config.timeoutMillis()
                        + " ms (possible deadlock, livelock or an oversubscribed machine)"),
                negativeControl);
    }

    static CheckResult error(String check, String algorithm, Config config, long seed,
            ConcurrentRunner.Outcome outcome, Map<String, Long> metrics, boolean negativeControl) {
        return new CheckResult(check, algorithm, config.threads(), config.iterationsPerThread(), seed,
                CheckResult.Status.ERROR, CheckResult.FailureCategory.EXCEPTION, millis(outcome), metrics,
                Diagnostics.describe(outcome.firstError()), negativeControl);
    }

    static long millis(ConcurrentRunner.Outcome outcome) {
        return outcome.durationNanos() / 1_000_000;
    }
}
