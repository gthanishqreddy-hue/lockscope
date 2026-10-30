package io.lockscope.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The desktop mode: one server serves the built dashboard at / and the API at /api/v1. */
class DashboardServingTest {

    @TempDir
    static Path temp;
    private static Path dashboard;
    private static LockScopeServer server;
    private static HttpClient client;
    private static String base;

    @BeforeAll
    static void start() throws Exception {
        dashboard = temp.resolve("dashboard");
        Files.createDirectories(dashboard.resolve("assets"));
        Files.writeString(dashboard.resolve("index.html"), "<!doctype html><title>LockScope</title>");
        Files.writeString(dashboard.resolve("assets/app-123.js"), "console.log(1)");
        Files.writeString(temp.resolve("secret.txt"), "outside the dashboard");
        server = new LockScopeServer(0, Set.of(), dashboard);
        server.start();
        base = "http://127.0.0.1:" + server.port();
        client = HttpClient.newHttpClient();
    }

    @AfterAll
    static void stop() {
        server.close();
    }

    private static HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(base + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void servesIndexWithSecurityHeaders() throws Exception {
        HttpResponse<String> response = get("/");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("<title>LockScope</title>"));
        assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("text/html"));
        assertEquals(DashboardHandler.CSP, response.headers().firstValue("Content-Security-Policy").orElse(null));
        assertEquals("nosniff", response.headers().firstValue("X-Content-Type-Options").orElse(null));
    }

    @Test
    void servesAssetsAndFallsBackToIndexForClientRoutes() throws Exception {
        HttpResponse<String> asset = get("/assets/app-123.js");
        assertEquals(200, asset.statusCode());
        assertTrue(asset.headers().firstValue("Content-Type").orElse("").startsWith("text/javascript"));
        assertTrue(asset.headers().firstValue("Cache-Control").orElse("").contains("immutable"));

        HttpResponse<String> route = get("/results/bench-1");
        assertEquals(200, route.statusCode());
        assertTrue(route.body().contains("<title>LockScope</title>"));

        assertEquals(404, get("/assets/missing.js").statusCode());
    }

    @Test
    void apiStillAnswersAndTheOwnOriginIsAllowed() throws Exception {
        String origin = "http://127.0.0.1:" + server.port();
        HttpResponse<String> health = client.send(HttpRequest.newBuilder(URI.create(base + "/api/v1/health"))
                .header("Origin", origin).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, health.statusCode());
        assertEquals(origin, health.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
        assertTrue(server.allowedOrigins().contains("http://localhost:" + server.port()));
        assertEquals(404, get("/api/v1/nope").statusCode());
    }

    @Test
    void onlyReadsAndRejectsForeignHosts() throws Exception {
        HttpResponse<String> post = client.send(HttpRequest.newBuilder(URI.create(base + "/"))
                .POST(HttpRequest.BodyPublishers.ofString("x")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(405, post.statusCode());
        // HttpClient does not let tests set Host, so send a raw request.
        try (Socket socket = new Socket("127.0.0.1", server.port())) {
            OutputStream out = socket.getOutputStream();
            out.write("GET / HTTP/1.1\r\nHost: attacker.example\r\nConnection: close\r\n\r\n"
                    .getBytes(StandardCharsets.US_ASCII));
            out.flush();
            InputStream in = socket.getInputStream();
            String status = new String(in.readNBytes(12), StandardCharsets.US_ASCII);
            assertEquals("HTTP/1.1 421", status);
        }
    }

    @Test
    void pathsCannotLeaveTheDashboardDirectory() {
        DashboardHandler handler = new DashboardHandler(dashboard);
        assertNull(handler.resolve("/../secret.txt"));
        assertNull(handler.resolve("/assets/../../secret.txt"));
        assertNull(handler.resolve("/..\\secret.txt"));
        assertNull(handler.resolve("/C:/Windows/win.ini"));
        assertNull(handler.resolve("/index.html::$DATA"));
        assertNull(handler.resolve("/a\0b"));
        assertNull(handler.resolve("relative"));
        assertEquals(dashboard.toAbsolutePath().normalize().resolve("index.html"), handler.resolve("/deep/link"));
    }

    @Test
    void refusesADirectoryWithoutIndex() {
        assertThrows(IllegalArgumentException.class, () -> new DashboardHandler(temp.resolve("empty")));
    }

    @Test
    void desktopAppFindsTheConfiguredDashboard() {
        String previous = System.getProperty("lockscope.dashboard");
        try {
            System.setProperty("lockscope.dashboard", dashboard.toString());
            assertEquals(dashboard, DesktopApp.findDashboard());
            System.setProperty("lockscope.dashboard", temp.resolve("empty").toString());
            assertNull(DesktopApp.findDashboard());
        } finally {
            if (previous == null) {
                System.clearProperty("lockscope.dashboard");
            } else {
                System.setProperty("lockscope.dashboard", previous);
            }
        }
    }

    @Test
    void recognisesARunningLockScope() {
        assertTrue(DesktopApp.isLockScopeDashboard(URI.create(base + "/")));
    }
}
