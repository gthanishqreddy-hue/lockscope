package io.lockscope.server;

import io.lockscope.bench.BenchmarkRequest;
import io.lockscope.bench.BenchmarkService;
import io.lockscope.bench.CorrectnessService;
import io.lockscope.bench.Ids;
import io.lockscope.bench.model.BenchmarkReport;
import io.lockscope.bench.model.CorrectnessReport;
import io.lockscope.correctness.CorrectnessSuite;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Runs experiments one at a time on a dedicated worker thread, with a small bounded queue, and
 * keeps the most recent ones in memory.
 *
 * <p>One at a time is deliberate: concurrent benchmarks would compete for CPUs and invalidate each
 * other's measurements. State is in memory only; restarting the server forgets all experiments
 * (export results you want to keep).
 */
final class ExperimentManager implements AutoCloseable {

    /** Thrown when the queue is full. */
    static final class QueueFullException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        QueueFullException(String message) {
            super(message);
        }
    }

    static final int QUEUE_CAPACITY = 4;
    static final int MAX_RETAINED = 50;

    private static final Logger LOG = Logger.getLogger(ExperimentManager.class.getName());

    private final Map<String, Experiment> experiments = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor executor;

    ExperimentManager() {
        AtomicInteger counter = new AtomicInteger();
        executor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(QUEUE_CAPACITY),
                r -> {
                    Thread t = new Thread(r, "lockscope-experiment-" + counter.incrementAndGet());
                    t.setDaemon(true);
                    return t;
                });
    }

    Experiment submitBenchmark(BenchmarkRequest request) {
        Experiment experiment = new Experiment(Ids.newId("bench"), Experiment.Type.BENCHMARK, request,
                request.points());
        submit(experiment, () -> runBenchmark(experiment, request));
        return experiment;
    }

    Experiment submitCorrectness(CorrectnessSuite.Config config) {
        Experiment experiment = new Experiment(Ids.newId("test"), Experiment.Type.CORRECTNESS, config,
                config.totalChecks());
        submit(experiment, () -> runCorrectness(experiment, config));
        return experiment;
    }

    private void submit(Experiment experiment, Runnable task) {
        evictOldFinished();
        experiments.put(experiment.id(), experiment);
        try {
            executor.execute(() -> {
                if (!experiment.start()) {
                    return; // cancelled while queued
                }
                LOG.info(() -> "experiment=" + experiment.id() + " status=RUNNING");
                try {
                    task.run();
                } catch (RuntimeException e) {
                    LOG.log(Level.WARNING, "experiment=" + experiment.id() + " failed", e);
                    experiment.fail("internal error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                }
                LOG.info(() -> "experiment=" + experiment.id() + " status=" + experiment.status());
            });
        } catch (RejectedExecutionException e) {
            experiments.remove(experiment.id());
            throw new QueueFullException("the experiment queue is full (" + QUEUE_CAPACITY
                    + " waiting); wait for one to finish or cancel one");
        }
    }

    private void runBenchmark(Experiment experiment, BenchmarkRequest request) {
        try {
            BenchmarkReport report = BenchmarkService.run(request, new BenchmarkService.Listener() {
                @Override
                public void pointStarted(int index, int total, String algorithm, int threads) {
                    experiment.progress(index, algorithm + " @ " + threads + " threads");
                }

                @Override
                public void pointFinished(int index, int total, BenchmarkReport.Measurement m) {
                    experiment.progress(index + 1, null);
                }
            }, experiment::isCancelRequested, null);
            experiment.succeed(report, experiment.isCancelRequested());
        } catch (BenchmarkService.BenchmarkFailedException e) {
            experiment.fail(e.getMessage());
        }
    }

    private void runCorrectness(Experiment experiment, CorrectnessSuite.Config config) {
        AtomicInteger done = new AtomicInteger();
        CorrectnessReport report = CorrectnessService.run(config, experiment::isCancelRequested,
                r -> experiment.progress(done.incrementAndGet(), r.check() + " / " + r.algorithm()));
        experiment.succeed(report, report.summary().cancelled());
    }

    Optional<Experiment> get(String id) {
        return Optional.ofNullable(experiments.get(id));
    }

    List<Experiment> list() {
        List<Experiment> all = new ArrayList<>(experiments.values());
        all.sort(Comparator.comparing(Experiment::createdAt).reversed());
        return all;
    }

    int queued() {
        return executor.getQueue().size();
    }

    private void evictOldFinished() {
        if (experiments.size() < MAX_RETAINED) {
            return;
        }
        experiments.values().stream()
                .filter(e -> e.status().finished())
                .min(Comparator.comparing(Experiment::createdAt))
                .ifPresent(e -> experiments.remove(e.id()));
    }

    @Override
    public void close() {
        experiments.values().forEach(Experiment::requestCancel);
        executor.shutdownNow();
    }
}
