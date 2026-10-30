package io.lockscope.bench;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.lockscope.bench.model.BenchmarkReport;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class BenchTest {

    private static BenchmarkRequest request(String kind, List<String> algorithms, List<Integer> threads, int forks) {
        return new BenchmarkRequest(kind, "custom", algorithms, threads, 2, 0, 64, 50, "thrpt", forks, 1, 100, 2, 100,
                false);
    }

    @Test
    void requestNormalizesAndValidates() {
        BenchmarkRequest r = request("LOCK", List.of("TAS", "mcs"), List.of(4, 1, 4), 1);
        assertEquals("lock", r.kind());
        assertEquals(List.of("tas", "mcs"), r.algorithms());
        assertEquals(List.of(1, 4), r.threadCounts());
        assertEquals(4, r.points());

        assertThrows(IllegalArgumentException.class, () -> request("lock", List.of("none"), List.of(1), 1));
        assertThrows(IllegalArgumentException.class, () -> request("lock", List.of("lazy"), List.of(1), 1));
        assertThrows(IllegalArgumentException.class, () -> request("lock", List.of("tas", "tas"), List.of(1), 1));
        assertThrows(IllegalArgumentException.class, () -> request("lock", List.of("tas"), List.of(0), 1));
        assertThrows(IllegalArgumentException.class, () -> request("lock", List.of("tas"), List.of(100_000), 1));
        assertThrows(IllegalArgumentException.class, () -> request("lock", List.of("tas"), List.of(1), 6));
        assertThrows(IllegalArgumentException.class, () -> request("queue", List.of("tas"), List.of(1), 1));
        assertThrows(IllegalArgumentException.class, () -> new BenchmarkRequest("set", null, List.of("lazy"),
                List.of(1), 0, 0, 0, 50, "thrpt", 1, 1, 100, 1, 100, false));
    }

    @Test
    void everyProfileIsValid() {
        assertTrue(BenchmarkProfiles.all().size() >= 10);
        BenchmarkProfiles.all().forEach(p -> assertEquals(p.kind(), p.defaults().kind()));
        assertThrows(IllegalArgumentException.class, () -> BenchmarkProfiles.get("nope"));
    }

    @Test
    void scalingHandlesMissingAndZeroBaselines() {
        assertEquals(2.0, Scaling.speedup(5, 10));
        assertEquals(0.5, Scaling.efficiency(2.0, 4));
        assertNull(Scaling.speedup(0, 10));
        assertNull(Scaling.speedup(Double.NaN, 10));
        assertNull(Scaling.speedup(5, Double.NaN));
        assertNull(Scaling.efficiency(null, 4));
    }

    @Test
    void csvFieldsAreEscapedAndInjectionSafe() {
        assertEquals("plain", ResultIO.csvField("plain"));
        assertEquals("\"a,b\"", ResultIO.csvField("a,b"));
        assertEquals("\"say \"\"hi\"\"\"", ResultIO.csvField("say \"hi\""));
        assertEquals("'=1+1", ResultIO.csvField("=1+1"));
        assertEquals("", ResultIO.csvField(null));
        assertEquals("-1", ResultIO.csvField(-1));
    }

    @Test
    void idsAreValidatedStrictly() {
        String id = Ids.newId("bench");
        assertTrue(Ids.isValid(id), id);
        assertTrue(!Ids.isValid("../../etc/passwd"));
        assertTrue(!Ids.isValid("bench-x"));
    }

    /** End-to-end through JMH (in-process, tiny) and back from disk. */
    @Test
    void inProcessBenchmarkRoundTripsThroughJsonAndCsv(@TempDir Path dir) throws Exception {
        BenchmarkRequest r = request("set", List.of("lazy"), List.of(1, 2), 0);
        BenchmarkReport report = BenchmarkService.run(r, new BenchmarkService.Listener() {}, () -> false, null);
        assertEquals(2, report.measurements().size());
        assertTrue(report.measurements().get(0).score() > 0);
        assertEquals("ops/us", report.methodology().scoreUnit());
        assertTrue(report.warnings().stream().anyMatch(w -> w.contains("forks=0")));
        assertNull(report.workload().criticalWork());

        Path json = dir.resolve("r.json");
        ResultIO.writeJson(report, json);
        BenchmarkReport back = ResultIO.readBenchmark(json);
        assertEquals(report.id(), back.id());
        assertEquals(report.measurements().get(1).score(), back.measurements().get(1).score());

        Path csv = dir.resolve("r.csv");
        ResultIO.writeCsv(report, csv);
        List<String> lines = Files.readAllLines(csv);
        assertEquals(3, lines.size());
        assertEquals(ResultIO.CSV_COLUMNS.size(), lines.get(1).split(",", -1).length);
    }

    @Test
    void cancellationReturnsAPartialReport() throws Exception {
        BenchmarkRequest r = request("lock", List.of("tas", "ttas"), List.of(1), 0);
        int[] started = {0};
        BenchmarkReport report = BenchmarkService.run(r, new BenchmarkService.Listener() {
            @Override
            public void pointStarted(int index, int total, String algorithm, int threads) {
                started[0]++;
            }
        }, () -> started[0] >= 1, null);
        assertEquals(1, report.measurements().size());
        assertTrue(report.warnings().get(0).startsWith("Cancelled after 1 of 2"));
    }
}
