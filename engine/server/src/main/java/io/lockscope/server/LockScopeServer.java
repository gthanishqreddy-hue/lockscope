package io.lockscope.server;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Logger;

/**
 * Local API server for the LockScope dashboard.
 *
 * <p>Binds to the loopback interface only. It is meant for one developer on their own machine;
 * it has no authentication and must not be exposed to a network (see SECURITY.md).
 *
 * <pre>
 *   --port N               default 8787
 *   --allowed-origins a,b  browser origins allowed by CORS
 *                          (default: the Vite dev and preview servers on localhost)
 *   --dashboard DIR        also serve a built dashboard (npm run build:desktop) at /;
 *                          the server's own origin is then allowed too
 * </pre>
 */
public final class LockScopeServer implements AutoCloseable {

    static final Set<String> DEFAULT_ORIGINS = Set.of(
            "http://localhost:5173", "http://127.0.0.1:5173",
            "http://localhost:4173", "http://127.0.0.1:4173");

    private static final Logger LOG = Logger.getLogger(LockScopeServer.class.getName());

    private final HttpServer server;
    private final ExperimentManager manager;
    private final ExecutorService httpThreads;
    private final Set<String> allowedOrigins;

    LockScopeServer(int port, Set<String> allowedOrigins) throws IOException {
        this(port, allowedOrigins, null);
    }

    /** @param dashboard directory with the built dashboard to serve at /, or null for the API only */
    LockScopeServer(int port, Set<String> allowedOrigins, Path dashboard) throws IOException {
        DashboardHandler dashboardHandler = dashboard == null ? null : new DashboardHandler(dashboard);
        manager = new ExperimentManager();
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 16);
        httpThreads = Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "lockscope-http");
            t.setDaemon(true);
            return t;
        });
        server.setExecutor(httpThreads);
        Set<String> origins = new LinkedHashSet<>(allowedOrigins);
        if (dashboardHandler != null) {
            int actualPort = port();
            origins.add("http://127.0.0.1:" + actualPort);
            origins.add("http://localhost:" + actualPort);
            server.createContext("/", dashboardHandler);
        }
        this.allowedOrigins = Set.copyOf(origins);
        server.createContext("/api/", new ApiHandler(manager, this.allowedOrigins));
    }

    void start() {
        server.start();
    }

    int port() {
        return server.getAddress().getPort();
    }

    Set<String> allowedOrigins() {
        return allowedOrigins;
    }

    @Override
    public void close() {
        server.stop(0);
        manager.close();
        httpThreads.shutdownNow();
    }

    public static void main(String[] args) throws IOException {
        int port = 8787;
        Set<String> origins = new LinkedHashSet<>(DEFAULT_ORIGINS);
        Path dashboard = null;
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--port" -> port = Integer.parseInt(value(args, ++i, "--port"));
                case "--allowed-origins" -> {
                    origins.clear();
                    origins.addAll(Arrays.stream(value(args, ++i, "--allowed-origins").split(","))
                            .map(String::trim).filter(s -> !s.isEmpty()).toList());
                }
                case "--dashboard" -> dashboard = Path.of(value(args, ++i, "--dashboard"));
                default -> {
                    System.err.println("unknown option " + args[i]);
                    System.exit(2);
                }
            }
        }
        LockScopeServer server = new LockScopeServer(port, origins, dashboard);
        server.start();
        Runtime.getRuntime().addShutdownHook(new Thread(server::close));
        LOG.info("LockScope API listening on http://127.0.0.1:" + server.port() + "/api/v1 (allowed origins: "
                + server.allowedOrigins() + ")");
        if (dashboard != null) {
            LOG.info("Dashboard: http://127.0.0.1:" + server.port() + "/");
        }
    }

    private static String value(String[] args, int index, String name) {
        if (index >= args.length) {
            System.err.println(name + " needs a value");
            System.exit(2);
        }
        return args[index];
    }
}
