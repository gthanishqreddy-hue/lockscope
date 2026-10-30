package io.lockscope.bench.cli;

import io.lockscope.bench.BenchmarkProfiles;
import io.lockscope.bench.BenchmarkRequest;
import io.lockscope.bench.BenchmarkService;
import io.lockscope.bench.CorrectnessService;
import io.lockscope.bench.ResultIO;
import io.lockscope.bench.Scaling;
import io.lockscope.bench.model.BenchmarkReport;
import io.lockscope.bench.model.CorrectnessReport;
import io.lockscope.bench.model.EnvironmentInfo;
import io.lockscope.correctness.CheckResult;
import io.lockscope.correctness.CorrectnessSuite;
import io.lockscope.lock.LockType;
import io.lockscope.set.SetType;
import java.io.PrintStream;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * {@code lockscope} command-line tool.
 *
 * <pre>
 *   lockscope stress   run correctness checks and write a lockscope.correctness/v1 report
 *   lockscope bench    run JMH benchmarks and write a lockscope.benchmark/v1 report (+ CSV)
 *   lockscope profiles list benchmark workload profiles
 *   lockscope env      print the environment metadata recorded in results
 * </pre>
 *
 * Exit codes: 0 success; 1 checks failed (or a negative control was not caught); 2 usage error;
 * 3 benchmark failure.
 */
public final class LockScopeCli {

    private static final PrintStream OUT = System.out;

    private LockScopeCli() {}

    public static void main(String[] argv) {
        System.exit(run(argv));
    }

    static int run(String[] argv) {
        if (argv.length == 0 || argv[0].equals("help") || argv[0].equals("--help")) {
            OUT.println(USAGE);
            return argv.length == 0 ? 2 : 0;
        }
        String command = argv[0];
        String[] rest = Arrays.copyOfRange(argv, 1, argv.length);
        try {
            return switch (command) {
                case "stress" -> stress(new Args(rest, Set.of()));
                case "bench" -> bench(new Args(rest, Set.of("no-gc", "quiet")));
                case "profiles" -> profiles();
                case "env" -> {
                    OUT.println(ResultIO.toJson(EnvironmentInfo.capture()));
                    yield 0;
                }
                default -> {
                    System.err.println("Unknown command '" + command + "'.\n\n" + USAGE);
                    yield 2;
                }
            };
        } catch (IllegalArgumentException e) {
            System.err.println("error: " + e.getMessage());
            return 2;
        } catch (BenchmarkService.BenchmarkFailedException e) {
            System.err.println("benchmark failed: " + e.getMessage());
            return 3;
        } catch (Exception e) {
            System.err.println("error: " + e);
            return 3;
        }
    }

    private static int stress(Args args) throws Exception {
        CorrectnessSuite.Target target = CorrectnessSuite.Target.fromId(args.string("target", "locks"));
        List<String> all = target == CorrectnessSuite.Target.LOCKS
                ? Arrays.stream(LockType.values()).map(LockType::id).toList()
                : Arrays.stream(SetType.values()).map(SetType::id).toList();
        List<String> algorithms = args.list("algorithms", List.of("all"));
        if (algorithms.equals(List.of("all"))) {
            algorithms = all;
        }
        CorrectnessSuite.Config d = CorrectnessSuite.Config.defaults(target, algorithms);
        CorrectnessSuite.Config config = new CorrectnessSuite.Config(target, algorithms,
                args.integer("threads", d.threads()),
                args.longValue("ops", d.operationsPerThread()),
                args.integer("runs", d.runs()),
                args.longValue("seed", d.seed()),
                args.integer("cs-work", d.criticalSectionWork()),
                args.integer("key-range", d.keyRange()),
                args.integer("read-percent", d.readPercent()),
                args.integer("lin-histories", d.linearizabilityHistories()),
                args.integer("lin-ops", d.linearizabilityOpsPerThread()),
                args.integer("lin-keys", d.linearizabilityKeys()),
                args.longValue("timeout-ms", d.timeoutMillis()));
        String out = args.string("out", null);
        args.rejectUnused();

        OUT.printf("Running %d checks (%s, %d threads, seed %d)...%n", config.totalChecks(),
                target.name().toLowerCase(Locale.ROOT), config.threads(), config.seed());
        CorrectnessReport report = CorrectnessService.run(config, () -> false, r -> OUT.printf(
                "  %-8s %-22s %-20s seed=%-6d %6d ms%s%n", label(r), r.check(), r.algorithm(), r.seed(),
                r.durationMillis(), r.failureCategory() == null ? "" : "  " + r.failureCategory()));
        Path file = Path.of(out != null ? out : "benchmark-results/local/" + report.id() + ".json");
        ResultIO.writeJson(report, file);
        CorrectnessReport.Summary s = report.summary();
        OUT.printf("%nPassed %d, failed %d, timed out %d, errors %d; negative controls detected %d, missed %d.%n",
                s.passed(), s.failed(), s.timedOut(), s.errors(), s.controlsDetected(), s.controlsMissed());
        OUT.println("Report: " + file.toAbsolutePath());
        OUT.println("Reproduce: " + report.reproduceCommand());
        return s.asExpected() ? 0 : 1;
    }

    private static String label(CheckResult r) {
        if (r.negativeControl()) {
            return r.asExpected() ? "CAUGHT" : "MISSED";
        }
        return r.status().name();
    }

    private static int bench(Args args) throws Exception {
        String profileName = args.string("profile", null);
        BenchmarkRequest base = profileName != null && !profileName.equals("custom")
                ? BenchmarkProfiles.get(profileName).defaults()
                : null;
        String kind = args.string("kind", base != null ? base.kind() : "lock");
        if (base != null && !base.kind().equals(kind)) {
            throw new IllegalArgumentException("profile " + profileName + " is a " + base.kind() + " profile");
        }
        List<String> defaultAlgorithms = base != null ? base.algorithms()
                : kind.equals("lock") ? LockType.realLocks().stream().map(LockType::id).toList()
                : Arrays.stream(SetType.values()).map(SetType::id).toList();
        List<String> algorithms = args.list("algorithms", defaultAlgorithms);
        if (algorithms.equals(List.of("all"))) {
            algorithms = defaultAlgorithms;
        }
        BenchmarkRequest request = new BenchmarkRequest(
                kind,
                profileName != null ? profileName : "custom",
                algorithms,
                args.intList("threads", base != null ? base.threadCounts() : BenchmarkProfiles.defaultThreadSweep()),
                args.integer("cs-work", base != null ? base.criticalWork() : 10),
                args.integer("ncs-work", base != null ? base.nonCriticalWork() : 0),
                args.integer("key-range", base != null ? base.keyRange() : 1024),
                args.integer("read-percent", base != null ? base.readPercent() : 80),
                args.string("mode", "thrpt"),
                args.integer("forks", base != null ? base.forks() : 2),
                args.integer("wi", base != null ? base.warmupIterations() : 5),
                args.integer("wt", base != null ? base.warmupMillis() : 1000),
                args.integer("mi", base != null ? base.measurementIterations() : 5),
                args.integer("mt", base != null ? base.measurementMillis() : 1000),
                !args.flag("no-gc"));
        boolean quiet = args.flag("quiet");
        String out = args.string("out", null);
        String csv = args.string("csv", null);
        args.rejectUnused();

        OUT.printf("Benchmarking %d points (%s x threads %s), estimated %d s...%n", request.points(),
                request.algorithms(), request.threadCounts(), request.estimatedSeconds());
        BenchmarkReport report = BenchmarkService.run(request, new BenchmarkService.Listener() {
            @Override
            public void pointStarted(int index, int total, String algorithm, int threads) {
                OUT.printf("[%d/%d] %s, %d threads%n", index + 1, total, algorithm, threads);
            }

            @Override
            public void pointFinished(int index, int total, BenchmarkReport.Measurement m) {
                OUT.printf("        %.3f %s (+/- %s)%n", m.score(), m.unit(),
                        m.scoreError() == null ? "n/a" : String.format("%.3f", m.scoreError()));
            }
        }, () -> false, quiet ? null : OUT);

        Path jsonFile = Path.of(out != null ? out : "benchmark-results/local/" + report.id() + ".json");
        ResultIO.writeJson(report, jsonFile);
        Path csvFile = Path.of(csv != null ? csv : jsonFile.toString().replaceAll("\\.json$", "") + ".csv");
        ResultIO.writeCsv(report, csvFile);

        OUT.println();
        OUT.println(Scaling.formatTable(report));
        report.warnings().forEach(w -> OUT.println("warning: " + w));
        OUT.println("JSON: " + jsonFile.toAbsolutePath());
        OUT.println("CSV:  " + csvFile.toAbsolutePath());
        return 0;
    }

    private static int profiles() {
        for (BenchmarkProfiles.Profile p : BenchmarkProfiles.all()) {
            OUT.printf("%-28s %-5s %s%n", p.name(), p.kind(), p.description());
        }
        return 0;
    }

    static final String USAGE = """
            LockScope engine

            Usage: lockscope <command> [options]
              (from the repository root: cd engine && ./gradlew :bench:run --args="<command> [options]")

            Commands:
              stress    Run correctness checks.
                        --target locks|sets  --algorithms all|id,id  --threads N  --ops N  --runs N
                        --seed N  --cs-work N  --key-range N  --read-percent N  --lin-histories N
                        --lin-ops N  --lin-keys N  --timeout-ms N  --out FILE.json
              bench     Run JMH benchmarks.
                        --profile NAME  --kind lock|set  --algorithms all|id,id  --threads 1,2,4
                        --cs-work N  --ncs-work N  --key-range N  --read-percent N  --mode thrpt|sample
                        --forks N  --wi N  --wt MS  --mi N  --mt MS  --no-gc  --quiet
                        --out FILE.json  --csv FILE.csv
              profiles  List workload profiles.
              env       Print environment metadata.

            Locks: tas ttas backoff clh mcs jdk-reentrant jdk-reentrant-fair (none = negative control)
            Sets:  coarse fine optimistic lazy lockfree
            """;
}
