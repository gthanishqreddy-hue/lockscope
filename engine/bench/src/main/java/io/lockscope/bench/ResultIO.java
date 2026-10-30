package io.lockscope.bench;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import io.lockscope.bench.model.BenchmarkReport;
import io.lockscope.bench.model.BenchmarkReport.Measurement;
import io.lockscope.bench.model.EnvironmentInfo;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** JSON and CSV serialization of result files. */
public final class ResultIO {

    /** Shared, thread-safe mapper. Pretty-printed so result files diff cleanly. */
    public static final ObjectMapper JSON = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT)
            .disable(SerializationFeature.FAIL_ON_EMPTY_BEANS);

    private ResultIO() {}

    public static void writeJson(Object report, Path file) throws IOException {
        Path parent = file.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        JSON.writeValue(file.toFile(), report);
    }

    public static String toJson(Object report) throws IOException {
        return JSON.writeValueAsString(report);
    }

    public static BenchmarkReport readBenchmark(Path file) throws IOException {
        BenchmarkReport report = JSON.readValue(file.toFile(), BenchmarkReport.class);
        if (!BenchmarkReport.SCHEMA.equals(report.schema())) {
            throw new IOException("unsupported schema '" + report.schema() + "', expected " + BenchmarkReport.SCHEMA);
        }
        return report;
    }

    public static final List<String> CSV_COLUMNS = List.of(
            "reportId", "kind", "profile", "algorithm", "threads", "score", "scoreError", "unit", "min", "max",
            "stdev", "sampleCount", "p50", "p90", "p99", "p99.9", "maxLatency", "allocBytesPerOp", "mode", "forks",
            "warmupIterations", "warmupMillis", "measurementIterations", "measurementMillis", "criticalWork",
            "nonCriticalWork", "keyRange", "readPercent", "javaVersion", "osName", "osArch", "availableProcessors",
            "origin", "createdAt");

    /** One row per measurement, with the shared configuration repeated on every row. */
    public static String toCsv(BenchmarkReport report) {
        StringBuilder csv = new StringBuilder(String.join(",", CSV_COLUMNS)).append('\n');
        EnvironmentInfo env = report.environment();
        BenchmarkReport.Methodology m = report.methodology();
        BenchmarkReport.Workload w = report.workload();
        for (Measurement x : report.measurements()) {
            Map<String, Double> p = x.percentiles() == null ? Map.of() : x.percentiles();
            List<Object> row = new ArrayList<>(List.of(report.id(), report.kind(), w.profile(), x.algorithm(),
                    x.threads()));
            row.add(x.score());
            row.add(x.scoreError());
            row.add(x.unit());
            row.add(x.min());
            row.add(x.max());
            row.add(x.stdev());
            row.add(x.sampleCount());
            row.add(p.get("p50"));
            row.add(p.get("p90"));
            row.add(p.get("p99"));
            row.add(p.get("p99.9"));
            row.add(p.get("max"));
            row.add(x.allocBytesPerOp());
            row.add(m.mode());
            row.add(m.forks());
            row.add(m.warmupIterations());
            row.add(m.warmupMillis());
            row.add(m.measurementIterations());
            row.add(m.measurementMillis());
            row.add(w.criticalWork());
            row.add(w.nonCriticalWork());
            row.add(w.keyRange());
            row.add(w.readPercent());
            row.add(env.javaVersion());
            row.add(env.osName());
            row.add(env.osArch());
            row.add(env.availableProcessors());
            row.add(report.origin());
            row.add(report.createdAt());
            for (int i = 0; i < row.size(); i++) {
                if (i > 0) {
                    csv.append(',');
                }
                csv.append(csvField(row.get(i)));
            }
            csv.append('\n');
        }
        return csv.toString();
    }

    public static void writeCsv(BenchmarkReport report, Path file) throws IOException {
        Path parent = file.toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.writeString(file, toCsv(report), StandardCharsets.UTF_8);
    }

    /**
     * Formats one CSV field per RFC 4180. Fields that a spreadsheet would treat as a formula are
     * prefixed with an apostrophe to prevent CSV injection.
     */
    static String csvField(Object value) {
        if (value == null) {
            return "";
        }
        String s = value instanceof Double d ? String.format(Locale.ROOT, "%.6g", d) : String.valueOf(value);
        if (value instanceof String && !s.isEmpty() && "=+-@".indexOf(s.charAt(0)) >= 0) {
            s = "'" + s;
        }
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            s = "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }
}
