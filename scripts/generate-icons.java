// Draws the LockScope logo (frontend/public/favicon.svg) at installer sizes and writes
// icon.png, icon.ico (Windows) and icon.icns (macOS) for jpackage, plus the window icon.
//
//   java scripts/generate-icons.java        (from the repository root, any JDK 17+)

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Arc2D;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.imageio.ImageIO;

public class GenerateIcons {

    static final Color BACKGROUND = new Color(0x11161f);
    static final Color ACCENT = new Color(0x3fd0b8);

    public static void main(String[] args) throws IOException {
        Path out = Path.of("engine/server/packaging/icons");
        Files.createDirectories(out);
        Files.write(out.resolve("icon.png"), png(512));
        Files.write(out.resolve("icon.ico"), ico(16, 24, 32, 48, 64, 128, 256));
        Files.write(out.resolve("icon.icns"), icns());
        Path resource = Path.of("engine/server/src/main/resources/io/lockscope/server/icon.png");
        Files.createDirectories(resource.getParent());
        Files.write(resource, png(256));
        System.out.println("wrote " + out + " and " + resource);
    }

    /** The favicon's 32x32 geometry, scaled to size x size. */
    static BufferedImage draw(int size) {
        BufferedImage image = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g.scale(size / 32.0, size / 32.0);
        g.setColor(BACKGROUND);
        g.fill(new RoundRectangle2D.Double(0, 0, 32, 32, 14, 14));
        Path2D shackle = new Path2D.Double();
        shackle.moveTo(11, 14);
        shackle.lineTo(11, 11);
        shackle.append(new Arc2D.Double(11, 6, 10, 10, 180, -180, Arc2D.OPEN), true);
        shackle.lineTo(21, 14);
        g.setColor(ACCENT);
        g.setStroke(new BasicStroke(2.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(shackle);
        g.fill(new RoundRectangle2D.Double(8, 14, 16, 11, 5, 5));
        g.setColor(BACKGROUND);
        g.fill(new Ellipse2D.Double(14, 17.5, 4, 4));
        g.dispose();
        return image;
    }

    static byte[] png(int size) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageIO.write(draw(size), "png", bytes);
        return bytes.toByteArray();
    }

    /** ICO with PNG-compressed entries (supported since Windows Vista). */
    static byte[] ico(int... sizes) throws IOException {
        Map<Integer, byte[]> images = new LinkedHashMap<>();
        for (int size : sizes) {
            images.put(size, png(size));
        }
        int offset = 6 + 16 * sizes.length;
        int total = offset + images.values().stream().mapToInt(b -> b.length).sum();
        ByteBuffer buffer = ByteBuffer.allocate(total).order(ByteOrder.LITTLE_ENDIAN);
        buffer.putShort((short) 0).putShort((short) 1).putShort((short) sizes.length);
        for (Map.Entry<Integer, byte[]> entry : images.entrySet()) {
            int size = entry.getKey();
            buffer.put((byte) (size >= 256 ? 0 : size)).put((byte) (size >= 256 ? 0 : size));
            buffer.put((byte) 0).put((byte) 0).putShort((short) 1).putShort((short) 32);
            buffer.putInt(entry.getValue().length).putInt(offset);
            offset += entry.getValue().length;
        }
        images.values().forEach(buffer::put);
        return buffer.array();
    }

    /** ICNS with PNG entries: ic07 128, ic08 256, ic09 512, ic10 1024 (512@2x). */
    static byte[] icns() throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("ic07", png(128));
        entries.put("ic08", png(256));
        entries.put("ic09", png(512));
        entries.put("ic10", png(1024));
        int total = 8 + entries.values().stream().mapToInt(b -> 8 + b.length).sum();
        ByteBuffer buffer = ByteBuffer.allocate(total).order(ByteOrder.BIG_ENDIAN);
        buffer.put("icns".getBytes(java.nio.charset.StandardCharsets.US_ASCII)).putInt(total);
        for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
            buffer.put(entry.getKey().getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            buffer.putInt(8 + entry.getValue().length).put(entry.getValue());
        }
        return buffer.array();
    }
}
