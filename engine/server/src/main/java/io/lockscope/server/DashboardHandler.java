package io.lockscope.server;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;

/**
 * Serves the built dashboard (a static single-page app) from a directory, for the desktop app.
 * Read-only: GET and HEAD only, files inside the directory only, and the same loopback Host check
 * as the API. Unknown paths without a file extension get {@code index.html} so that deep links
 * such as {@code /results/x} reach the client-side router.
 */
final class DashboardHandler implements HttpHandler {

    static final String CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            + "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; "
            + "base-uri 'self'; form-action 'none'";

    private static final Map<String, String> TYPES = Map.ofEntries(
            Map.entry("html", "text/html; charset=utf-8"),
            Map.entry("js", "text/javascript; charset=utf-8"),
            Map.entry("css", "text/css; charset=utf-8"),
            Map.entry("json", "application/json; charset=utf-8"),
            Map.entry("svg", "image/svg+xml"),
            Map.entry("png", "image/png"),
            Map.entry("ico", "image/x-icon"),
            Map.entry("txt", "text/plain; charset=utf-8"),
            Map.entry("map", "application/json; charset=utf-8"),
            Map.entry("woff2", "font/woff2"));

    private final Path root;

    DashboardHandler(Path root) {
        this.root = root.toAbsolutePath().normalize();
        if (!Files.isRegularFile(this.root.resolve("index.html"))) {
            throw new IllegalArgumentException("no index.html in dashboard directory " + this.root);
        }
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        try (exchange) {
            var headers = exchange.getResponseHeaders();
            headers.set("X-Content-Type-Options", "nosniff");
            headers.set("Referrer-Policy", "no-referrer");
            if (!ApiHandler.isLoopbackHost(exchange.getRequestHeaders().getFirst("Host"))) {
                sendText(exchange, 421, "This server only answers requests addressed to localhost or 127.0.0.1.");
                return;
            }
            String method = exchange.getRequestMethod();
            if (!method.equals("GET") && !method.equals("HEAD")) {
                headers.set("Allow", "GET, HEAD");
                sendText(exchange, 405, "Method not allowed.");
                return;
            }
            Path file = resolve(exchange.getRequestURI().getPath());
            if (file == null) {
                sendText(exchange, 404, "Not found.");
                return;
            }
            String name = file.getFileName().toString();
            String type = TYPES.getOrDefault(extension(name), "application/octet-stream");
            headers.set("Content-Type", type);
            if (name.equals("index.html")) {
                headers.set("Content-Security-Policy", CSP);
                headers.set("Cache-Control", "no-cache");
            } else if (file.startsWith(root.resolve("assets"))) {
                headers.set("Cache-Control", "public, max-age=31536000, immutable");
            } else {
                headers.set("Cache-Control", "no-cache");
            }
            long size = Files.size(file);
            if (method.equals("HEAD")) {
                exchange.sendResponseHeaders(200, -1);
                return;
            }
            exchange.sendResponseHeaders(200, size == 0 ? -1 : size);
            try (OutputStream out = exchange.getResponseBody()) {
                Files.copy(file, out);
            }
        }
    }

    /**
     * Maps a request path to a file under the root, or null. Rejects anything that would leave the
     * root; paths without an extension fall back to index.html (client-side routes).
     */
    Path resolve(String requestPath) {
        if (requestPath == null || !requestPath.startsWith("/") || requestPath.indexOf('\0') >= 0
                || requestPath.contains("\\") || requestPath.contains(":")) {
            return null;
        }
        String relative = requestPath.substring(1);
        Path candidate;
        try {
            candidate = root.resolve(relative).normalize();
        } catch (RuntimeException e) { // InvalidPathException on characters the OS rejects
            return null;
        }
        if (!candidate.startsWith(root)) {
            return null;
        }
        if (Files.isRegularFile(candidate)) {
            return candidate;
        }
        String last = relative.substring(relative.lastIndexOf('/') + 1);
        return extension(last).isEmpty() ? root.resolve("index.html") : null;
    }

    private static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static void sendText(HttpExchange exchange, int status, String text) throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }
}
