package io.lockscope.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Contract tests against a real server on an ephemeral loopback port. */
class ApiServerTest {

    private static final String ORIGIN = "http://localhost:5173";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static LockScopeServer server;
    private static HttpClient client;
    private static String base;

    @BeforeAll
    static void start() throws Exception {
        server = new LockScopeServer(0, Set.of(ORIGIN));
        server.start();
        base = "http://127.0.0.1:" + server.port() + "/api/v1";
        client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    @AfterAll
    static void stop() {
        server.close();
    }

    private static HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(base + path)).header("Origin", ORIGIN).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private static HttpResponse<String> post(String path, String body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(base + path)).header("Origin", ORIGIN)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void healthReportsOkWithCorsHeader() throws Exception {
        HttpResponse<String> response = get("/health");
        assertEquals(200, response.statusCode());
        assertEquals("ok", JSON.readTree(response.body()).get("status").asText());
        assertEquals(ORIGIN, response.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
    }

    @Test
    void foreignOriginIsRejected() throws Exception {
        HttpResponse<String> response = client.send(HttpRequest.newBuilder(URI.create(base + "/health"))
                .header("Origin", "https://evil.example").GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(403, response.statusCode());
    }

    @Test
    void hostHeaderMustBeLoopback() {
        assertTrue(ApiHandler.isLoopbackHost("localhost:8787"));
        assertTrue(ApiHandler.isLoopbackHost("127.0.0.1:8787"));
        assertTrue(ApiHandler.isLoopbackHost("[::1]:8787"));
        assertFalse(ApiHandler.isLoopbackHost("attacker.example:8787"));
        assertFalse(ApiHandler.isLoopbackHost("localhost.attacker.example"));
        assertFalse(ApiHandler.isLoopbackHost(null));
    }

    @Test
    void preflightIsAnswered() throws Exception {
        HttpResponse<String> response = client.send(HttpRequest.newBuilder(URI.create(base + "/experiments"))
                .header("Origin", ORIGIN).method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(204, response.statusCode());
        assertTrue(response.headers().firstValue("Access-Control-Allow-Methods").orElse("").contains("POST"));
    }

    @Test
    void capabilitiesAndAlgorithmsDescribeTheEngine() throws Exception {
        JsonNode caps = JSON.readTree(get("/capabilities").body());
        assertTrue(caps.get("benchmarks").asBoolean());
        assertTrue(caps.get("profiles").size() >= 10);
        JsonNode algorithms = JSON.readTree(get("/algorithms").body());
        assertEquals(8, algorithms.get("locks").size());
        assertEquals(5, algorithms.get("sets").size());
        assertEquals("FIFO", algorithms.get("locks").get(3).get("properties").get("fairness").asText());
    }

    @Test
    void unknownRoutesAndMethodsAreRejected() throws Exception {
        assertEquals(404, get("/nope").statusCode());
        assertEquals(404, get("/experiments/not-an-id").statusCode());
        assertEquals(405, post("/health", "{}").statusCode());
    }

    @Test
    void invalidExperimentsAreRejectedWithMessages() throws Exception {
        HttpResponse<String> badJson = post("/experiments", "{not json");
        assertEquals(400, badJson.statusCode());
        assertEquals("invalid_json", JSON.readTree(badJson.body()).get("error").get("code").asText());

        HttpResponse<String> unknownField = post("/experiments", "{\"type\":\"correctness\",\"bogus\":1}");
        assertEquals(400, unknownField.statusCode());

        HttpResponse<String> badThreads = post("/experiments",
                "{\"type\":\"correctness\",\"correctness\":{\"target\":\"locks\",\"algorithms\":[\"tas\"],\"threads\":100000}}");
        assertEquals(400, badThreads.statusCode());
        assertTrue(JSON.readTree(badThreads.body()).get("error").get("message").asText().contains("threads"));

        HttpResponse<String> control = post("/experiments",
                "{\"type\":\"benchmark\",\"benchmark\":{\"kind\":\"lock\",\"algorithms\":[\"none\"]}}");
        assertEquals(400, control.statusCode());

        // 7 locks x 4 thread counts x 5 forks x ~1000 s is far beyond the 4-hour limit.
        HttpResponse<String> tooLong = post("/experiments", "{\"type\":\"benchmark\",\"benchmark\":{\"kind\":\"lock\","
                + "\"algorithms\":[\"tas\",\"ttas\",\"backoff\",\"clh\",\"mcs\",\"jdk-reentrant\",\"jdk-reentrant-fair\"],"
                + "\"threadCounts\":[1,2,3,4],\"forks\":5,\"warmupIterations\":50,"
                + "\"warmupMillis\":10000,\"measurementIterations\":50,\"measurementMillis\":10000}}");
        assertEquals(400, tooLong.statusCode());
        assertTrue(JSON.readTree(tooLong.body()).get("error").get("message").asText().contains("minutes"));
    }

    @Test
    void correctnessExperimentRunsToCompletionAndExports() throws Exception {
        HttpResponse<String> created = post("/experiments", "{\"type\":\"correctness\",\"correctness\":{"
                + "\"target\":\"locks\",\"algorithms\":[\"ttas\",\"none\"],\"threads\":4,"
                + "\"operationsPerThread\":20000,\"runs\":1,\"seed\":7}}");
        assertEquals(202, created.statusCode(), created.body());
        String id = JSON.readTree(created.body()).get("id").asText();

        JsonNode experiment = awaitFinished(id);
        assertEquals("SUCCEEDED", experiment.get("status").asText(), experiment.toString());
        JsonNode report = experiment.get("result");
        assertEquals("lockscope.correctness/v1", report.get("schema").asText());
        assertTrue(report.get("summary").get("asExpected").asBoolean());
        assertEquals(2, report.get("summary").get("controlsDetected").asInt());

        HttpResponse<String> export = get("/experiments/" + id + "/export?format=json");
        assertEquals(200, export.statusCode());
        assertTrue(export.headers().firstValue("Content-Disposition").orElse("").contains(id));
        assertEquals(400, get("/experiments/" + id + "/export?format=csv").statusCode());

        JsonNode list = JSON.readTree(get("/experiments").body());
        assertTrue(list.get("experiments").size() >= 1);
        assertTrue(list.get("experiments").get(0).get("result").isNull(), "list view must omit results");
        assertEquals(409, post("/experiments/" + id + "/cancel", "").statusCode());
    }

    @Test
    void benchmarkExperimentProducesReportAndCsv() throws Exception {
        HttpResponse<String> created = post("/experiments", "{\"type\":\"benchmark\",\"benchmark\":{"
                + "\"kind\":\"lock\",\"algorithms\":[\"ttas\"],\"threadCounts\":[1,2],\"forks\":0,"
                + "\"warmupIterations\":1,\"warmupMillis\":100,\"measurementIterations\":2,"
                + "\"measurementMillis\":100,\"gcProfiler\":false}}");
        assertEquals(202, created.statusCode(), created.body());
        String id = JSON.readTree(created.body()).get("id").asText();
        JsonNode experiment = awaitFinished(id);
        assertEquals("SUCCEEDED", experiment.get("status").asText(), experiment.toString());
        JsonNode report = experiment.get("result");
        assertEquals("lockscope.benchmark/v1", report.get("schema").asText());
        assertEquals(2, report.get("measurements").size());
        assertTrue(report.get("measurements").get(0).get("score").asDouble() > 0);
        HttpResponse<String> csv = get("/experiments/" + id + "/export?format=csv");
        assertEquals(200, csv.statusCode());
        assertTrue(csv.body().startsWith("reportId,kind,profile,algorithm,threads,score"));
        assertEquals(3, csv.body().strip().split("\n").length);
    }

    private static JsonNode awaitFinished(String id) throws Exception {
        long deadline = System.nanoTime() + Duration.ofMinutes(3).toNanos();
        while (System.nanoTime() < deadline) {
            JsonNode node = JSON.readTree(get("/experiments/" + id).body());
            String status = node.get("status").asText();
            if (!status.equals("QUEUED") && !status.equals("RUNNING")) {
                return node;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("experiment " + id + " did not finish");
    }
}
