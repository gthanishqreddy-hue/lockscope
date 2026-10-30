package io.lockscope.correctness;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Starts a fixed number of worker threads behind a start gate, waits for them with a deadline and
 * reports what happened.
 *
 * <p>Workers are daemon threads. If the deadline passes, {@link #aborted()} becomes true and
 * workers that poll it stop early. A worker stuck inside a broken lock cannot be stopped from the
 * outside in Java; it keeps spinning until the JVM exits, and the outcome reports a timeout.
 */
public final class ConcurrentRunner {

    /** Per-thread body; receives the worker index in {@code [0, threads)}. */
    @FunctionalInterface
    public interface Worker {
        void run(int threadIndex) throws Exception;
    }

    /** What happened during a run. */
    public record Outcome(boolean timedOut, Throwable firstError, long durationNanos) {}

    /** Hard cap on worker threads per run, so a request can never create unbounded threads. */
    public static final int MAX_THREADS = 256;

    private volatile boolean aborted;

    /** Whether the run passed its deadline; long-running workers should poll this. */
    public boolean aborted() {
        return aborted;
    }

    public Outcome run(int threads, Worker worker, long timeoutMillis) {
        if (threads < 1 || threads > MAX_THREADS) {
            throw new IllegalArgumentException("threads must be in [1, " + MAX_THREADS + "], was " + threads);
        }
        if (timeoutMillis <= 0) {
            throw new IllegalArgumentException("timeoutMillis must be positive");
        }
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        AtomicReference<Throwable> firstError = new AtomicReference<>();
        List<Thread> workers = new ArrayList<>(threads);
        for (int t = 0; t < threads; t++) {
            final int index = t;
            Thread thread = new Thread(() -> {
                ready.countDown();
                try {
                    go.await();
                    worker.run(index);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } catch (Throwable e) {
                    firstError.compareAndSet(null, e);
                }
            }, "lockscope-worker-" + t);
            thread.setDaemon(true);
            workers.add(thread);
        }
        workers.forEach(Thread::start);
        try {
            ready.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            aborted = true;
            go.countDown();
            return new Outcome(false, e, 0);
        }
        long start = System.nanoTime();
        go.countDown();
        long deadline = start + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
        boolean timedOut = false;
        for (Thread thread : workers) {
            long remaining = deadline - System.nanoTime();
            try {
                if (remaining > 0) {
                    TimeUnit.NANOSECONDS.timedJoin(thread, remaining);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                aborted = true;
                return new Outcome(false, e, System.nanoTime() - start);
            }
            if (thread.isAlive()) {
                timedOut = true;
                break;
            }
        }
        long duration = System.nanoTime() - start;
        if (timedOut) {
            aborted = true;
        }
        return new Outcome(timedOut, firstError.get(), duration);
    }
}
