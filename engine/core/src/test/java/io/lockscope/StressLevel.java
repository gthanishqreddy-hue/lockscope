package io.lockscope;

/** Scales test effort: {@code -Plockscope.stress=heavy} runs ten times more iterations. */
public final class StressLevel {

    private StressLevel() {}

    public static long scale(long base) {
        return "heavy".equals(System.getProperty("lockscope.stress")) ? base * 10 : base;
    }

    /** Threads to use for contended tests: at least 4, at most the number of CPUs (min 4). */
    public static int threads() {
        return Math.max(4, Runtime.getRuntime().availableProcessors());
    }
}
