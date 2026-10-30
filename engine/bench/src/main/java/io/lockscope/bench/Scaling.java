package io.lockscope.bench;

import io.lockscope.bench.model.BenchmarkReport;
import io.lockscope.bench.model.BenchmarkReport.Measurement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalDouble;

/**
 * Speedup and efficiency from throughput measurements.
 *
 * <p>With a fixed amount of work, {@code S(n) = T(1) / T(n)}. Throughput {@code X} is work per
 * unit time, so {@code T(n) = W / X(n)} and therefore {@code S(n) = X(n) / X(1)}. Efficiency is
 * {@code E(n) = S(n) / n}. For a single contended lock, {@code S(n) < 1} is expected: the critical
 * section is serial by design, so extra threads add hand-off cost rather than parallelism.
 * The frontend implements the same formulas in {@code src/utils/scaling.ts}.
 */
public final class Scaling {

    /** One derived point; {@code null} values mean "undefined" (no or zero baseline). */
    public record Point(int threads, double throughput, Double speedup, Double efficiency) {}

    private Scaling() {}

    public static Double speedup(double baselineThroughput, double throughput) {
        if (!(baselineThroughput > 0) || !Double.isFinite(throughput) || throughput < 0) {
            return null;
        }
        return throughput / baselineThroughput;
    }

    public static Double efficiency(Double speedup, int threads) {
        return speedup == null || threads < 1 ? null : speedup / threads;
    }

    /** Points for one algorithm; requires throughput mode and a 1-thread measurement. */
    public static List<Point> forAlgorithm(List<Measurement> measurements) {
        OptionalDouble baseline = measurements.stream().filter(m -> m.threads() == 1)
                .mapToDouble(Measurement::score).findFirst();
        List<Point> points = new ArrayList<>();
        for (Measurement m : measurements) {
            Double s = baseline.isPresent() ? speedup(baseline.getAsDouble(), m.score()) : null;
            points.add(new Point(m.threads(), m.score(), s, efficiency(s, m.threads())));
        }
        return points;
    }

    /** Human-readable table for the CLI. */
    public static String formatTable(BenchmarkReport report) {
        boolean throughput = report.methodology().mode().equals("thrpt");
        Map<String, List<Measurement>> byAlgorithm = new LinkedHashMap<>();
        report.measurements().forEach(m -> byAlgorithm.computeIfAbsent(m.algorithm(), k -> new ArrayList<>()).add(m));
        StringBuilder table = new StringBuilder(String.format("%-20s %8s %14s %12s %10s %11s%n",
                "algorithm", "threads", "score", "+/- 99.9%", "speedup", "efficiency"));
        for (Map.Entry<String, List<Measurement>> e : byAlgorithm.entrySet()) {
            List<Point> points = throughput ? forAlgorithm(e.getValue()) : List.of();
            for (int i = 0; i < e.getValue().size(); i++) {
                Measurement m = e.getValue().get(i);
                Point p = throughput ? points.get(i) : null;
                table.append(String.format("%-20s %8d %14.3f %12s %10s %11s%n", e.getKey(), m.threads(), m.score(),
                        m.scoreError() == null ? "n/a" : String.format("%.3f", m.scoreError()),
                        p == null || p.speedup() == null ? "-" : String.format("%.2fx", p.speedup()),
                        p == null || p.efficiency() == null ? "-" : String.format("%.0f%%", 100 * p.efficiency())));
            }
        }
        table.append("score unit: ").append(report.methodology().scoreUnit());
        return table.toString();
    }
}
