package io.lockscope.correctness;

import io.lockscope.lock.LockType;
import io.lockscope.set.SetType;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Runs the correctness checks for a selection of algorithms, repeatedly, with derived seeds.
 * Shared by the command-line runner and the local API.
 */
public final class CorrectnessSuite {

    /** Which family of algorithms to check. */
    public enum Target {
        LOCKS,
        SETS;

        public static Target fromId(String id) {
            return valueOf(id.trim().toUpperCase(Locale.ROOT));
        }
    }

    /**
     * Suite configuration. For sets, {@code operationsPerThread} applies to the partitioned and
     * conservation checks; the linearizability check uses short histories of
     * {@code linearizabilityOpsPerThread} operations on {@code linearizabilityKeys} keys.
     */
    public record Config(
            Target target,
            List<String> algorithms,
            int threads,
            long operationsPerThread,
            int runs,
            long seed,
            int criticalSectionWork,
            int keyRange,
            int readPercent,
            int linearizabilityHistories,
            int linearizabilityOpsPerThread,
            int linearizabilityKeys,
            long timeoutMillis) {

        public static final int MAX_RUNS = 100;

        public Config {
            algorithms = List.copyOf(algorithms);
            if (algorithms.isEmpty()) {
                throw new IllegalArgumentException("select at least one algorithm");
            }
            for (String id : algorithms) {
                if (target == Target.LOCKS) {
                    LockType.fromId(id);
                } else {
                    SetType.fromId(id);
                }
            }
            if (runs < 1 || runs > MAX_RUNS) {
                throw new IllegalArgumentException("runs must be in [1, " + MAX_RUNS + "]");
            }
            if (linearizabilityHistories < 0 || linearizabilityHistories > 100_000) {
                throw new IllegalArgumentException("linearizabilityHistories must be in [0, 100000]");
            }
            if (linearizabilityKeys < 1 || linearizabilityKeys > 64) {
                throw new IllegalArgumentException("linearizabilityKeys must be in [1, 64]");
            }
            if (linearizabilityOpsPerThread < 1) {
                throw new IllegalArgumentException("linearizabilityOpsPerThread must be positive");
            }
            // Validate the check-level parameters eagerly so bad input fails before any run.
            if (target == Target.LOCKS) {
                new LockChecks.Config(threads, operationsPerThread, criticalSectionWork, timeoutMillis);
            } else {
                new SetChecks.Config(threads, operationsPerThread, keyRange, readPercent, timeoutMillis);
                if ((long) threads * linearizabilityOpsPerThread > SetChecks.MAX_LINEARIZABILITY_HISTORY) {
                    throw new IllegalArgumentException("threads x linearizabilityOpsPerThread must be at most "
                            + SetChecks.MAX_LINEARIZABILITY_HISTORY);
                }
            }
        }

        /** Defaults that finish in seconds on a laptop. */
        public static Config defaults(Target target, List<String> algorithms) {
            return new Config(target, algorithms, Math.min(8, Runtime.getRuntime().availableProcessors()),
                    target == Target.LOCKS ? 100_000 : 50_000, 3, 42L, 10, 256, 50, 300, 8, 3, 60_000);
        }

        /** Number of check executions this configuration produces. */
        public int totalChecks() {
            int perRun = target == Target.LOCKS ? 2 : (linearizabilityHistories > 0 ? 3 : 2);
            return algorithms.size() * runs * perRun;
        }
    }

    private CorrectnessSuite() {}

    /**
     * Runs every check. Stops early (and marks nothing as passed that did not run) when
     * {@code cancelled} returns true between checks.
     */
    public static List<CheckResult> run(Config config, BooleanSupplier cancelled, Consumer<CheckResult> onResult) {
        List<CheckResult> results = new ArrayList<>();
        for (int run = 0; run < config.runs(); run++) {
            long seed = config.seed() + run;
            for (String id : config.algorithms()) {
                List<Supplier<CheckResult>> checks = checksFor(config, id, seed);
                for (Supplier<CheckResult> check : checks) {
                    if (cancelled.getAsBoolean()) {
                        return results;
                    }
                    CheckResult result = check.get();
                    results.add(result);
                    onResult.accept(result);
                }
            }
        }
        return results;
    }

    private static List<Supplier<CheckResult>> checksFor(Config config, String id, long seed) {
        List<Supplier<CheckResult>> checks = new ArrayList<>();
        if (config.target() == Target.LOCKS) {
            LockType type = LockType.fromId(id);
            boolean control = type.category() == LockType.Category.CONTROL;
            LockChecks.Config lockConfig = new LockChecks.Config(config.threads(), config.operationsPerThread(),
                    config.criticalSectionWork(), config.timeoutMillis());
            checks.add(() -> LockChecks.lostUpdate(type.id(), type.create(), lockConfig, seed, control));
            checks.add(() -> LockChecks.mutualExclusion(type.id(), type.create(), lockConfig, seed, control));
        } else {
            SetType type = SetType.fromId(id);
            SetChecks.Config setConfig = new SetChecks.Config(config.threads(), config.operationsPerThread(),
                    config.keyRange(), config.readPercent(), config.timeoutMillis());
            checks.add(() -> SetChecks.partitionedReference(type.id(), type::create, setConfig, seed));
            checks.add(() -> SetChecks.conservation(type.id(), type::create, setConfig, seed));
            if (config.linearizabilityHistories() > 0) {
                SetChecks.Config linConfig = new SetChecks.Config(config.threads(),
                        config.linearizabilityOpsPerThread(), config.linearizabilityKeys(), config.readPercent(),
                        config.timeoutMillis());
                checks.add(() -> SetChecks.linearizability(type.id(), type::create, linConfig, seed,
                        config.linearizabilityHistories()));
            }
        }
        return checks;
    }
}
