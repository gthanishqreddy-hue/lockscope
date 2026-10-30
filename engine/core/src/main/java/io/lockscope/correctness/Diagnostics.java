package io.lockscope.correctness;

import java.util.ArrayList;
import java.util.List;

/** Formats exceptions into bounded diagnostic lines for reports. */
final class Diagnostics {

    private static final int MAX_FRAMES = 12;

    private Diagnostics() {}

    static List<String> describe(Throwable error) {
        List<String> lines = new ArrayList<>();
        if (error == null) {
            return lines;
        }
        lines.add(error.getClass().getName() + ": " + error.getMessage());
        StackTraceElement[] frames = error.getStackTrace();
        for (int i = 0; i < Math.min(frames.length, MAX_FRAMES); i++) {
            lines.add("  at " + frames[i]);
        }
        if (frames.length > MAX_FRAMES) {
            lines.add("  ... " + (frames.length - MAX_FRAMES) + " more");
        }
        return lines;
    }
}
