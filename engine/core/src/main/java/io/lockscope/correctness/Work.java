package io.lockscope.correctness;

/**
 * Deterministic CPU busy-work used to lengthen critical sections and to model non-critical work.
 * The result must be consumed (for example published to {@link #sink}) so the JIT cannot remove
 * the loop.
 */
public final class Work {

    /** Upper bound accepted for work units per call. */
    public static final int MAX_UNITS = 100_000;

    /** Written once per worker so the computed values are observable and cannot be elided. */
    public static volatile long sink;

    private Work() {}

    /** Performs {@code units} rounds of xorshift arithmetic starting from {@code seed}. */
    public static long spin(long seed, int units) {
        long x = seed | 1;
        for (int i = 0; i < units; i++) {
            x ^= x << 13;
            x ^= x >>> 7;
            x ^= x << 17;
        }
        return x;
    }
}
