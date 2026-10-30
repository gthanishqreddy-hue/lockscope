package io.lockscope.server;

import io.lockscope.bench.ResultIO;
import io.lockscope.bench.model.EnvironmentInfo;
import java.awt.BorderLayout;
import java.awt.Desktop;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.awt.Image;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.io.IOException;
import java.net.BindException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import javax.imageio.ImageIO;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;
import javax.swing.UIManager;
import javax.swing.UnsupportedLookAndFeelException;
import javax.swing.WindowConstants;

/**
 * Entry point of the installed desktop app: starts the engine with the bundled dashboard on
 * {@code http://127.0.0.1:8787/} (or a free port when 8787 is taken), opens it in the default
 * browser and shows a small window to reopen it or quit. Without a display it runs in the
 * console until interrupted.
 *
 * <p>The dashboard directory is {@code -Dlockscope.dashboard=DIR}, or {@code dashboard/} next to
 * (or one level above) the directory holding this class's jar, which matches both the installers
 * and the universal zip.
 */
public final class DesktopApp {

    static final int PREFERRED_PORT = 8787;

    private DesktopApp() {}

    public static void main(String[] args) {
        boolean headless = GraphicsEnvironment.isHeadless() || List.of(args).contains("--no-window");
        try {
            Path dashboard = findDashboard();
            if (dashboard == null) {
                fail(headless, "The dashboard files were not found. Reinstall LockScope, or start it with "
                        + "-Dlockscope.dashboard=<folder with index.html>.");
                return;
            }
            URI existing = URI.create("http://127.0.0.1:" + PREFERRED_PORT + "/");
            if (isLockScopeDashboard(existing)) {
                // Already running (for example, started twice): just show it.
                openBrowser(existing);
                if (headless) {
                    System.out.println("LockScope is already running at " + existing);
                }
                return;
            }
            LockScopeServer server = start(dashboard);
            URI url = URI.create("http://127.0.0.1:" + server.port() + "/");
            Runtime.getRuntime().addShutdownHook(new Thread(server::close));
            if (headless) {
                System.out.println("LockScope " + EnvironmentInfo.LOCKSCOPE_VERSION + " is running at " + url);
                System.out.println("Open that address in a browser. Press Ctrl+C to stop.");
            } else {
                SwingUtilities.invokeLater(() -> showWindow(url, server));
                openBrowser(url);
            }
        } catch (IOException | RuntimeException e) {
            fail(headless, "LockScope could not start: " + e.getMessage());
        }
    }

    static LockScopeServer start(Path dashboard) throws IOException {
        LockScopeServer server;
        try {
            server = new LockScopeServer(PREFERRED_PORT, Set.of(), dashboard);
        } catch (BindException e) {
            server = new LockScopeServer(0, Set.of(), dashboard); // 8787 is used by something else
        }
        server.start();
        return server;
    }

    static Path findDashboard() {
        String configured = System.getProperty("lockscope.dashboard");
        if (configured != null) {
            return hasIndex(Path.of(configured)) ? Path.of(configured) : null;
        }
        try {
            Path jarDir = Path.of(DesktopApp.class.getProtectionDomain().getCodeSource().getLocation().toURI())
                    .getParent();
            // Installers: app/dashboard next to the jars; universal zip: lib/ and dashboard/ side by side.
            for (Path dir : new Path[] {jarDir, jarDir == null ? null : jarDir.getParent()}) {
                if (dir != null && hasIndex(dir.resolve("dashboard"))) {
                    return dir.resolve("dashboard");
                }
            }
        } catch (URISyntaxException | RuntimeException e) {
            return null;
        }
        return null;
    }

    private static boolean hasIndex(Path dir) {
        return Files.isRegularFile(dir.resolve("index.html"));
    }

    /** True when a LockScope engine already serves the dashboard at {@code url}. */
    static boolean isLockScopeDashboard(URI url) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(500)).build();
        try {
            HttpResponse<String> health = client.send(HttpRequest.newBuilder(url.resolve("api/v1/health"))
                    .timeout(Duration.ofSeconds(2)).build(), HttpResponse.BodyHandlers.ofString());
            if (health.statusCode() != 200 || !"ok".equals(ResultIO.JSON.readTree(health.body()).path("status").asText())) {
                return false;
            }
            HttpResponse<Void> page = client.send(HttpRequest.newBuilder(url).timeout(Duration.ofSeconds(2))
                    .method("HEAD", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.discarding());
            return page.statusCode() == 200
                    && page.headers().firstValue("Content-Type").orElse("").startsWith("text/html");
        } catch (IOException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    static void openBrowser(URI url) {
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(url);
                return;
            }
            String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
            List<String> command = os.contains("win") ? List.of("rundll32", "url.dll,FileProtocolHandler", url.toString())
                    : os.contains("mac") ? List.of("open", url.toString())
                    : List.of("xdg-open", url.toString());
            new ProcessBuilder(command).inheritIO().start();
        } catch (IOException | RuntimeException e) {
            System.err.println("Could not open a browser; open " + url + " yourself.");
        }
    }

    private static void showWindow(URI url, LockScopeServer server) {
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (ReflectiveOperationException | UnsupportedLookAndFeelException e) {
            // keep the default look and feel
        }
        JFrame frame = new JFrame("LockScope");
        frame.setDefaultCloseOperation(WindowConstants.DO_NOTHING_ON_CLOSE);
        frame.addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                frame.dispose();
                server.close();
                System.exit(0);
            }
        });
        Image icon = loadIcon();
        if (icon != null) {
            frame.setIconImage(icon);
        }

        JLabel title = new JLabel("LockScope is running");
        title.setFont(title.getFont().deriveFont(Font.BOLD, title.getFont().getSize2D() + 4));
        JLabel address = new JLabel("Dashboard: " + url);
        JLabel note = new JLabel("<html>Experiments run on this computer. Closing this window stops LockScope.</html>");

        JPanel text = new JPanel();
        text.setLayout(new BoxLayout(text, BoxLayout.Y_AXIS));
        text.add(title);
        text.add(Box.createVerticalStrut(8));
        text.add(address);
        text.add(Box.createVerticalStrut(4));
        text.add(note);

        JButton open = new JButton("Open dashboard");
        open.addActionListener(e -> openBrowser(url));
        JButton quit = new JButton("Quit");
        quit.addActionListener(e -> frame.dispatchEvent(new WindowEvent(frame, WindowEvent.WINDOW_CLOSING)));
        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        buttons.add(quit);
        buttons.add(open);

        JPanel content = new JPanel(new BorderLayout(0, 16));
        content.setBorder(BorderFactory.createEmptyBorder(18, 20, 16, 20));
        content.add(text, BorderLayout.CENTER);
        content.add(buttons, BorderLayout.SOUTH);
        frame.setContentPane(content);
        frame.getRootPane().setDefaultButton(open);
        frame.pack();
        frame.setMinimumSize(frame.getSize());
        frame.setLocationRelativeTo(null);
        frame.setVisible(true);
    }

    private static Image loadIcon() {
        try (var in = DesktopApp.class.getResourceAsStream("icon.png")) {
            return in == null ? null : ImageIO.read(in);
        } catch (IOException e) {
            return null;
        }
    }

    private static void fail(boolean headless, String message) {
        if (headless) {
            System.err.println(message);
        } else {
            JOptionPane.showMessageDialog(null, message, "LockScope", JOptionPane.ERROR_MESSAGE);
        }
        System.exit(1);
    }
}
