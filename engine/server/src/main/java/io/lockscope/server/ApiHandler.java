package io.lockscope.server;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import io.lockscope.bench.BenchmarkProfiles;
import io.lockscope.bench.BenchmarkRequest;
import io.lockscope.bench.Ids;
import io.lockscope.bench.ResultIO;
import io.lockscope.bench.model.BenchmarkReport;
import io.lockscope.bench.model.EnvironmentInfo;
import io.lockscope.lock.LockType;
import io.lockscope.set.SetType;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Routes and handles {@code /api/v1/*}. Every response is JSON except CSV exports; errors use
 * {@code {"error": {"code": ..., "message": ...}}}.
 */
final class ApiHandler implements HttpHandler {

    static final int MAX_BODY_BYTES = 64 * 1024;
    private static final String PREFIX = "/api/v1";
    private static final Logger LOG = Logger.getLogger(ApiHandler.class.getName());

    private final ObjectMapper json = ResultIO.JSON.copy()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES);
    private final ExperimentManager manager;
    private final Set<String> allowedOrigins;
    private final Instant startedAt = Instant.now();

    ApiHandler(ExperimentManager manager, Set<String> allowedOrigins) {
        this.manager = manager;
        this.allowedOrigins = Set.copyOf(allowedOrigins);
    }

    /** An error with an HTTP status; the message is safe to show to clients. */
    static final class ApiException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final int status;
        final String code;

        ApiException(int status, String code, String message) {
            super(message);
            this.status = status;
            this.code = code;
        }
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        try (exchange) {
            // DNS-rebinding defence: a page on another domain that resolves to 127.0.0.1 sends its own
            // host name, and same-origin requests carry no Origin header for the CORS check to catch.
            if (!isLoopbackHost(exchange.getRequestHeaders().getFirst("Host"))) {
                send(exchange, 421, error("misdirected_request", "the API only answers requests addressed to "
                        + "localhost or 127.0.0.1"));
                return;
            }
            String origin = exchange.getRequestHeaders().getFirst("Origin");
            if (origin != null && !allowedOrigins.contains(origin)) {
                send(exchange, 403, error("origin_not_allowed", "origin " + origin + " is not allowed; start the "
                        + "server with --allowed-origins to permit it"));
                return;
            }
            if (origin != null) {
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", origin);
                exchange.getResponseHeaders().set("Vary", "Origin");
            }
            if (exchange.getRequestMethod().equals("OPTIONS")) {
                exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
                exchange.getResponseHeaders().set("Access-Control-Max-Age", "600");
                // Chromium's Private Network Access: an allowed public origin calling localhost.
                if ("true".equals(exchange.getRequestHeaders().getFirst("Access-Control-Request-Private-Network"))) {
                    exchange.getResponseHeaders().set("Access-Control-Allow-Private-Network", "true");
                }
                exchange.sendResponseHeaders(204, -1);
                return;
            }
            try {
                route(exchange);
            } catch (ApiException e) {
                send(exchange, e.status, error(e.code, e.getMessage()));
            } catch (IllegalArgumentException e) {
                send(exchange, 400, error("invalid_request", e.getMessage()));
            } catch (ExperimentManager.QueueFullException e) {
                send(exchange, 429, error("queue_full", e.getMessage()));
            } catch (RuntimeException e) {
                LOG.log(Level.WARNING, "unhandled error for " + exchange.getRequestURI().getPath(), e);
                send(exchange, 500, error("internal_error", "internal server error"));
            }
        }
    }

    private void route(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        if (!path.startsWith(PREFIX)) {
            throw new ApiException(404, "not_found", "no such endpoint");
        }
        List<String> parts = Arrays.stream(path.substring(PREFIX.length()).split("/"))
                .filter(s -> !s.isEmpty()).toList();

        if (parts.equals(List.of("health"))) {
            requireMethod(method, "GET");
            send(exchange, 200, Map.of("status", "ok", "version", EnvironmentInfo.LOCKSCOPE_VERSION,
                    "uptimeSeconds", Duration.between(startedAt, Instant.now()).toSeconds()));
        } else if (parts.equals(List.of("capabilities"))) {
            requireMethod(method, "GET");
            send(exchange, 200, capabilities());
        } else if (parts.equals(List.of("algorithms"))) {
            requireMethod(method, "GET");
            send(exchange, 200, algorithms());
        } else if (parts.equals(List.of("experiments"))) {
            if (method.equals("GET")) {
                send(exchange, 200, Map.of("experiments", manager.list().stream().map(e -> e.view(false)).toList()));
            } else {
                requireMethod(method, "POST");
                send(exchange, 202, create(readBody(exchange)).view(false));
            }
        } else if (parts.size() == 2 && parts.get(0).equals("experiments")) {
            requireMethod(method, "GET");
            send(exchange, 200, find(parts.get(1)).view(true));
        } else if (parts.size() == 3 && parts.get(0).equals("experiments") && parts.get(2).equals("cancel")) {
            requireMethod(method, "POST");
            Experiment experiment = find(parts.get(1));
            if (!experiment.requestCancel()) {
                throw new ApiException(409, "already_finished", "the experiment has already finished");
            }
            send(exchange, 202, experiment.view(false));
        } else if (parts.size() == 3 && parts.get(0).equals("experiments") && parts.get(2).equals("export")) {
            requireMethod(method, "GET");
            export(exchange, find(parts.get(1)));
        } else {
            throw new ApiException(404, "not_found", "no such endpoint");
        }
    }

    private Experiment create(byte[] body) {
        ApiRequests.CreateExperiment request;
        try {
            request = json.readValue(body, ApiRequests.CreateExperiment.class);
        } catch (JsonProcessingException e) {
            throw new ApiException(400, "invalid_json", "request body is not valid: " + e.getOriginalMessage());
        } catch (IOException e) {
            throw new ApiException(400, "invalid_json", "request body could not be read");
        }
        if (request == null || request.type() == null) {
            throw new IllegalArgumentException("type is required ('benchmark' or 'correctness')");
        }
        return switch (request.type()) {
            case "benchmark" -> {
                if (request.benchmark() == null || request.correctness() != null) {
                    throw new IllegalArgumentException("a benchmark experiment needs exactly a 'benchmark' object");
                }
                yield manager.submitBenchmark(request.benchmark().toRequest());
            }
            case "correctness" -> {
                if (request.correctness() == null || request.benchmark() != null) {
                    throw new IllegalArgumentException("a correctness experiment needs exactly a 'correctness' object");
                }
                yield manager.submitCorrectness(request.correctness().toConfig());
            }
            default -> throw new IllegalArgumentException("type must be 'benchmark' or 'correctness'");
        };
    }

    private void export(HttpExchange exchange, Experiment experiment) throws IOException {
        Object result = experiment.result();
        if (result == null) {
            throw new ApiException(409, "no_result", "the experiment has no result yet (status "
                    + experiment.status() + ")");
        }
        String format = queryParam(exchange, "format").orElse("json");
        String filename = experiment.id();
        if (format.equals("csv")) {
            if (!(result instanceof BenchmarkReport report)) {
                throw new ApiException(400, "unsupported_format", "CSV export is only available for benchmarks");
            }
            exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"" + filename + ".csv\"");
            sendRaw(exchange, 200, "text/csv; charset=utf-8", ResultIO.toCsv(report).getBytes(StandardCharsets.UTF_8));
        } else if (format.equals("json")) {
            exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"" + filename + ".json\"");
            send(exchange, 200, result);
        } else {
            throw new ApiException(400, "unsupported_format", "format must be 'json' or 'csv'");
        }
    }

    private Experiment find(String id) {
        if (!Ids.isValid(id)) {
            throw new ApiException(404, "not_found", "no experiment with that id");
        }
        return manager.get(id).orElseThrow(() -> new ApiException(404, "not_found", "no experiment with that id"));
    }

    private Map<String, Object> capabilities() {
        Map<String, Object> caps = new LinkedHashMap<>();
        caps.put("engine", "lockscope-engine");
        caps.put("version", EnvironmentInfo.LOCKSCOPE_VERSION);
        caps.put("benchmarks", true);
        caps.put("correctness", true);
        caps.put("cancellation", "between benchmark points / between correctness checks");
        caps.put("maxConcurrentExperiments", 1);
        caps.put("queueCapacity", ExperimentManager.QUEUE_CAPACITY);
        caps.put("queued", manager.queued());
        caps.put("maxThreads", BenchmarkRequest.maxThreads());
        caps.put("maxForks", BenchmarkRequest.MAX_FORKS);
        caps.put("maxIterations", BenchmarkRequest.MAX_ITERATIONS);
        caps.put("iterationMillisRange", List.of(BenchmarkRequest.MIN_ITERATION_MILLIS,
                BenchmarkRequest.MAX_ITERATION_MILLIS));
        caps.put("maxCorrectnessRuns", ApiRequests.MAX_API_RUNS);
        caps.put("persistence", "in-memory; experiments are lost when the server stops");
        caps.put("environment", EnvironmentInfo.capture());
        caps.put("profiles", BenchmarkProfiles.all().stream().map(p -> Map.of(
                "name", p.name(), "kind", p.kind(), "description", p.description(), "defaults", p.defaults())).toList());
        return caps;
    }

    private static Map<String, Object> algorithms() {
        return Map.of(
                "locks", Arrays.stream(LockType.values()).map(t -> Map.of(
                        "id", t.id(), "name", t.displayName(), "category", t.category(),
                        "properties", t.create().properties())).toList(),
                "sets", Arrays.stream(SetType.values()).map(t -> Map.of(
                        "id", t.id(), "name", t.displayName(), "properties", t.create().properties())).toList());
    }

    static boolean isLoopbackHost(String host) {
        if (host == null) {
            return false;
        }
        String name = host.startsWith("[") ? host.substring(0, host.indexOf(']') + 1)
                : host.contains(":") ? host.substring(0, host.lastIndexOf(':')) : host;
        return name.equalsIgnoreCase("localhost") || name.equals("127.0.0.1") || name.equals("[::1]");
    }

    private static void requireMethod(String actual, String expected) {
        if (!actual.equals(expected)) {
            throw new ApiException(405, "method_not_allowed", "use " + expected);
        }
    }

    private static Optional<String> queryParam(HttpExchange exchange, String name) {
        String query = exchange.getRequestURI().getRawQuery();
        if (query == null) {
            return Optional.empty();
        }
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && pair.substring(0, eq).equals(name)) {
                return Optional.of(pair.substring(eq + 1));
            }
        }
        return Optional.empty();
    }

    private static byte[] readBody(HttpExchange exchange) throws IOException {
        String type = exchange.getRequestHeaders().getFirst("Content-Type");
        if (type == null || !type.toLowerCase().startsWith("application/json")) {
            throw new ApiException(415, "unsupported_media_type", "send the body as application/json");
        }
        try (InputStream in = exchange.getRequestBody()) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) != -1) {
                if (buffer.size() + n > MAX_BODY_BYTES) {
                    throw new ApiException(413, "body_too_large", "request body exceeds " + MAX_BODY_BYTES + " bytes");
                }
                buffer.write(chunk, 0, n);
            }
            return buffer.toByteArray();
        }
    }

    private static Map<String, Object> error(String code, String message) {
        return Map.of("error", Map.of("code", code, "message", message == null ? code : message));
    }

    private void send(HttpExchange exchange, int status, Object body) throws IOException {
        sendRaw(exchange, status, "application/json; charset=utf-8", json.writeValueAsBytes(body));
    }

    private static void sendRaw(HttpExchange exchange, int status, String contentType, byte[] bytes)
            throws IOException {
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
