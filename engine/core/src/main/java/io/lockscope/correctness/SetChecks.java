package io.lockscope.correctness;

import io.lockscope.correctness.SetLinearizabilityChecker.Op;
import io.lockscope.correctness.SetLinearizabilityChecker.OpType;
import io.lockscope.set.ConcurrentSet;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * Correctness checks for {@link ConcurrentSet} implementations.
 *
 * <ul>
 *   <li><b>Partitioned reference</b>: each thread works on its own residue class of keys, so the
 *       result of every single operation is determined by that thread's own history. Every return
 *       value is compared with a sequential reference model, under full concurrency on the shared
 *       list structure.
 *   <li><b>Conservation</b>: all threads hammer a shared key range. Per key, the number of
 *       successful adds minus successful removes, plus the initial membership, must equal the
 *       final membership (0 or 1). This holds for every linearizable set and catches lost or
 *       duplicated updates.
 *   <li><b>Linearizability</b>: many small histories on a few hot keys, each recorded with a shared
 *       atomic clock and checked exhaustively by {@link SetLinearizabilityChecker}.
 * </ul>
 *
 * <p>All three also verify the structural invariants of the quiescent list afterwards.
 */
public final class SetChecks {

    /** Longest history (all threads together) accepted by the linearizability check. */
    public static final int MAX_LINEARIZABILITY_HISTORY = 256;

    private SetChecks() {}

    /** Configuration for the set checks. */
    public record Config(int threads, long operationsPerThread, int keyRange, int readPercent, long timeoutMillis) {
        public Config {
            if (threads < 1 || threads > ConcurrentRunner.MAX_THREADS) {
                throw new IllegalArgumentException("threads must be in [1, " + ConcurrentRunner.MAX_THREADS + "]");
            }
            if (operationsPerThread < 1 || operationsPerThread > 10_000_000L) {
                throw new IllegalArgumentException("operationsPerThread must be in [1, 10000000]");
            }
            if (keyRange < 1 || keyRange > 1_000_000) {
                throw new IllegalArgumentException("keyRange must be in [1, 1000000]");
            }
            if (readPercent < 0 || readPercent > 100) {
                throw new IllegalArgumentException("readPercent must be in [0, 100]");
            }
            if (timeoutMillis < 1) {
                throw new IllegalArgumentException("timeoutMillis must be positive");
            }
        }
    }

    // ---------------------------------------------------------------- partitioned reference

    public static CheckResult partitionedReference(
            String algorithm, Supplier<ConcurrentSet<Integer>> factory, Config config, long seed) {
        ConcurrentSet<Integer> set = factory.get();
        int threads = config.threads();
        ConcurrentLinkedQueue<String> mismatches = new ConcurrentLinkedQueue<>();
        AtomicLong mismatchCount = new AtomicLong();
        boolean[][] models = new boolean[threads][];
        ConcurrentRunner runner = new ConcurrentRunner();
        ConcurrentRunner.Outcome outcome = runner.run(threads, t -> {
            SplittableRandom random = new SplittableRandom(seed * 31 + t);
            int ownKeys = Math.max(1, config.keyRange() / threads);
            boolean[] model = new boolean[ownKeys];
            for (long i = 0; i < config.operationsPerThread(); i++) {
                if ((i & 1023) == 0 && runner.aborted()) {
                    break;
                }
                int slot = random.nextInt(ownKeys);
                int key = slot * threads + t; // key % threads == t: no other thread touches it
                int dice = random.nextInt(100);
                boolean actual;
                boolean expected;
                String op;
                if (dice < config.readPercent()) {
                    op = "contains";
                    actual = set.contains(key);
                    expected = model[slot];
                } else if (random.nextBoolean()) {
                    op = "add";
                    actual = set.add(key);
                    expected = !model[slot];
                    model[slot] = true;
                } else {
                    op = "remove";
                    actual = set.remove(key);
                    expected = model[slot];
                    model[slot] = false;
                }
                if (actual != expected) {
                    if (mismatchCount.incrementAndGet() <= CheckResult.MAX_DIAGNOSTICS) {
                        mismatches.add(String.format("thread %d op #%d %s(%d) returned %s, reference model says %s",
                                t, i, op, key, actual, expected));
                    }
                }
            }
            models[t] = model;
        }, config.timeoutMillis());

        String check = "set.partitioned-reference";
        Map<String, Long> metrics = new LinkedHashMap<>();
        if (outcome.timedOut()) {
            return timeout(check, algorithm, config, seed, outcome, metrics);
        }
        if (outcome.firstError() != null) {
            return error(check, algorithm, config, seed, outcome, metrics);
        }
        List<String> diagnostics = new ArrayList<>(mismatches);
        CheckResult.FailureCategory category = mismatchCount.get() > 0 ? CheckResult.FailureCategory.REFERENCE_MISMATCH : null;

        Set<Integer> expectedFinal = new HashSet<>();
        for (int t = 0; t < threads; t++) {
            for (int slot = 0; slot < models[t].length; slot++) {
                if (models[t][slot]) {
                    expectedFinal.add(slot * threads + t);
                }
            }
        }
        category = verifyFinalState(set, expectedFinal, diagnostics, category);
        metrics.put("operations", threads * config.operationsPerThread());
        metrics.put("resultMismatches", mismatchCount.get());
        metrics.put("finalSize", (long) expectedFinal.size());
        return result(check, algorithm, config, seed, outcome, metrics, diagnostics, category);
    }

    // ---------------------------------------------------------------- conservation

    public static CheckResult conservation(
            String algorithm, Supplier<ConcurrentSet<Integer>> factory, Config config, long seed) {
        ConcurrentSet<Integer> set = factory.get();
        int range = config.keyRange();
        boolean[] initial = new boolean[range];
        SplittableRandom prefill = new SplittableRandom(seed);
        for (int k = 0; k < range; k++) {
            if (prefill.nextBoolean()) {
                initial[k] = true;
                set.add(k);
            }
        }
        long[][] successfulAdds = new long[config.threads()][];
        long[][] successfulRemoves = new long[config.threads()][];
        ConcurrentRunner runner = new ConcurrentRunner();
        ConcurrentRunner.Outcome outcome = runner.run(config.threads(), t -> {
            SplittableRandom random = new SplittableRandom(seed * 31 + t + 1);
            long[] adds = new long[range];
            long[] removes = new long[range];
            for (long i = 0; i < config.operationsPerThread(); i++) {
                if ((i & 1023) == 0 && runner.aborted()) {
                    break;
                }
                int key = random.nextInt(range);
                int dice = random.nextInt(100);
                if (dice < config.readPercent()) {
                    set.contains(key);
                } else if (random.nextBoolean()) {
                    if (set.add(key)) {
                        adds[key]++;
                    }
                } else if (set.remove(key)) {
                    removes[key]++;
                }
            }
            successfulAdds[t] = adds;
            successfulRemoves[t] = removes;
        }, config.timeoutMillis());

        String check = "set.conservation";
        Map<String, Long> metrics = new LinkedHashMap<>();
        if (outcome.timedOut()) {
            return timeout(check, algorithm, config, seed, outcome, metrics);
        }
        if (outcome.firstError() != null) {
            return error(check, algorithm, config, seed, outcome, metrics);
        }
        List<String> diagnostics = new ArrayList<>();
        CheckResult.FailureCategory category = null;
        Set<Integer> expectedFinal = new HashSet<>();
        long violations = 0;
        long totalAdds = 0;
        long totalRemoves = 0;
        for (int k = 0; k < range; k++) {
            long net = initial[k] ? 1 : 0;
            for (int t = 0; t < config.threads(); t++) {
                net += successfulAdds[t][k] - successfulRemoves[t][k];
                totalAdds += successfulAdds[t][k];
                totalRemoves += successfulRemoves[t][k];
            }
            if (net != 0 && net != 1) {
                violations++;
                diagnostics.add(String.format("key %d: initial %s, net successful adds-removes gives membership %d",
                        k, initial[k], net));
            } else if (net == 1) {
                expectedFinal.add(k);
            }
        }
        if (violations > 0) {
            category = CheckResult.FailureCategory.CONSERVATION_VIOLATION;
        }
        category = verifyFinalState(set, expectedFinal, diagnostics, category);
        metrics.put("operations", config.threads() * config.operationsPerThread());
        metrics.put("successfulAdds", totalAdds);
        metrics.put("successfulRemoves", totalRemoves);
        metrics.put("conservationViolations", violations);
        return result(check, algorithm, config, seed, outcome, metrics, diagnostics, category);
    }

    // ---------------------------------------------------------------- linearizability

    /**
     * Runs {@code histories} short concurrent histories; {@code config.operationsPerThread()} is
     * the length of each thread's part of one history and {@code config.keyRange()} should be
     * small (2-8) so operations collide.
     */
    public static CheckResult linearizability(
            String algorithm, Supplier<ConcurrentSet<Integer>> factory, Config config, long seed, int histories) {
        String check = "set.linearizability";
        if ((long) config.threads() * config.operationsPerThread() > MAX_LINEARIZABILITY_HISTORY) {
            throw new IllegalArgumentException("threads x operationsPerThread must be at most "
                    + MAX_LINEARIZABILITY_HISTORY + " for the bounded linearizability checker");
        }
        long start = System.nanoTime();
        long totalOps = 0;
        long inconclusive = 0;
        long deadline = start + config.timeoutMillis() * 1_000_000L;
        for (int h = 0; h < histories; h++) {
            if (System.nanoTime() - deadline > 0) {
                Map<String, Long> metrics = Map.of("historiesChecked", (long) h, "historiesRequested", (long) histories);
                return new CheckResult(check, algorithm, config.threads(), config.operationsPerThread(), seed,
                        CheckResult.Status.TIMEOUT, CheckResult.FailureCategory.TIMEOUT,
                        (System.nanoTime() - start) / 1_000_000, metrics,
                        List.of("time budget of " + config.timeoutMillis() + " ms used up after " + h + " histories"),
                        false);
            }
            long historySeed = seed * 1_000_003L + h;
            ConcurrentSet<Integer> set = factory.get();
            AtomicLong clock = new AtomicLong();
            ConcurrentLinkedQueue<Op> history = new ConcurrentLinkedQueue<>();
            ConcurrentRunner runner = new ConcurrentRunner();
            ConcurrentRunner.Outcome outcome = runner.run(config.threads(), t -> {
                SplittableRandom random = new SplittableRandom(historySeed * 31 + t);
                List<Op> local = new ArrayList<>();
                for (long i = 0; i < config.operationsPerThread(); i++) {
                    int key = random.nextInt(config.keyRange());
                    int dice = random.nextInt(100);
                    OpType type = dice < config.readPercent() ? OpType.CONTAINS
                            : random.nextBoolean() ? OpType.ADD : OpType.REMOVE;
                    long invoke = clock.getAndIncrement();
                    boolean result = switch (type) {
                        case ADD -> set.add(key);
                        case REMOVE -> set.remove(key);
                        case CONTAINS -> set.contains(key);
                    };
                    long response = clock.getAndIncrement();
                    local.add(new Op(t, type, key, result, invoke, response));
                }
                history.addAll(local);
            }, config.timeoutMillis());
            Map<String, Long> metrics = new LinkedHashMap<>();
            if (outcome.timedOut()) {
                return timeout(check, algorithm, config, seed, outcome, metrics);
            }
            if (outcome.firstError() != null) {
                return error(check, algorithm, config, seed, outcome, metrics);
            }
            List<Op> ops = new ArrayList<>(history);
            totalOps += ops.size();
            SetLinearizabilityChecker.Verdict verdict = SetLinearizabilityChecker.check(ops, Set.of());
            if (verdict.inconclusive()) {
                inconclusive++;
                continue;
            }
            List<String> invariantViolations = set.checkInvariants();
            if (!verdict.linearizable() || !invariantViolations.isEmpty()) {
                List<String> diagnostics = new ArrayList<>();
                CheckResult.FailureCategory category;
                if (!verdict.linearizable()) {
                    category = CheckResult.FailureCategory.NOT_LINEARIZABLE;
                    diagnostics.add("history " + h + " (seed " + historySeed + ") is not linearizable on key "
                            + verdict.failingKey() + "; operations on that key:");
                    verdict.failingHistory().stream()
                            .sorted((a, b) -> Long.compare(a.invoke(), b.invoke()))
                            .forEach(op -> diagnostics.add("  " + op));
                } else {
                    category = CheckResult.FailureCategory.INVARIANT_VIOLATION;
                    diagnostics.addAll(invariantViolations);
                }
                metrics.put("historiesChecked", (long) h + 1);
                metrics.put("operationsChecked", totalOps);
                return new CheckResult(check, algorithm, config.threads(), config.operationsPerThread(), seed,
                        CheckResult.Status.FAILED, category, (System.nanoTime() - start) / 1_000_000, metrics,
                        diagnostics, false);
            }
        }
        Map<String, Long> metrics = new LinkedHashMap<>();
        metrics.put("historiesChecked", (long) histories - inconclusive);
        metrics.put("historiesInconclusive", inconclusive);
        metrics.put("operationsChecked", totalOps);
        List<String> diagnostics = new ArrayList<>();
        CheckResult.Status status = CheckResult.Status.PASSED;
        CheckResult.FailureCategory category = null;
        if (inconclusive == histories) {
            status = CheckResult.Status.FAILED;
            category = CheckResult.FailureCategory.INCONCLUSIVE;
            diagnostics.add("every history exceeded the checker's bounds; nothing was verified");
        }
        return new CheckResult(check, algorithm, config.threads(), config.operationsPerThread(), seed, status,
                category, (System.nanoTime() - start) / 1_000_000, metrics, diagnostics, false);
    }

    // ---------------------------------------------------------------- helpers

    private static CheckResult.FailureCategory verifyFinalState(ConcurrentSet<Integer> set, Set<Integer> expected,
            List<String> diagnostics, CheckResult.FailureCategory category) {
        List<String> invariantViolations = set.checkInvariants();
        if (!invariantViolations.isEmpty()) {
            diagnostics.addAll(invariantViolations);
            if (category == null) {
                category = CheckResult.FailureCategory.INVARIANT_VIOLATION;
            }
        }
        Set<Integer> actual = new HashSet<>(set.snapshot());
        if (!actual.equals(expected)) {
            Set<Integer> missing = new HashSet<>(expected);
            missing.removeAll(actual);
            Set<Integer> extra = new HashSet<>(actual);
            extra.removeAll(expected);
            diagnostics.add("final contents differ from the expected set: missing " + limit(missing)
                    + ", unexpected " + limit(extra));
            if (category == null) {
                category = CheckResult.FailureCategory.REFERENCE_MISMATCH;
            }
        }
        if (set.size() != expected.size()) {
            diagnostics.add("size() is " + set.size() + " but " + expected.size() + " elements are expected");
            if (category == null) {
                category = CheckResult.FailureCategory.INVARIANT_VIOLATION;
            }
        }
        return category;
    }

    private static String limit(Set<Integer> keys) {
        return keys.stream().sorted().limit(10).toList() + (keys.size() > 10 ? " (+" + (keys.size() - 10) + " more)" : "");
    }

    private static CheckResult result(String check, String algorithm, Config config, long seed,
            ConcurrentRunner.Outcome outcome, Map<String, Long> metrics, List<String> diagnostics,
            CheckResult.FailureCategory category) {
        return new CheckResult(check, algorithm, config.threads(), config.operationsPerThread(), seed,
                category == null ? CheckResult.Status.PASSED : CheckResult.Status.FAILED, category,
                outcome.durationNanos() / 1_000_000, metrics, diagnostics, false);
    }

    private static CheckResult timeout(String check, String algorithm, Config config, long seed,
            ConcurrentRunner.Outcome outcome, Map<String, Long> metrics) {
        return new CheckResult(check, algorithm, config.threads(), config.operationsPerThread(), seed,
                CheckResult.Status.TIMEOUT, CheckResult.FailureCategory.TIMEOUT, outcome.durationNanos() / 1_000_000,
                metrics, List.of("workers did not finish within " + config.timeoutMillis() + " ms"), false);
    }

    private static CheckResult error(String check, String algorithm, Config config, long seed,
            ConcurrentRunner.Outcome outcome, Map<String, Long> metrics) {
        return new CheckResult(check, algorithm, config.threads(), config.operationsPerThread(), seed,
                CheckResult.Status.ERROR, CheckResult.FailureCategory.EXCEPTION, outcome.durationNanos() / 1_000_000,
                metrics, Diagnostics.describe(outcome.firstError()), false);
    }
}
