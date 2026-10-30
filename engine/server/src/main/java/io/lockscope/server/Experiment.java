package io.lockscope.server;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * A queued, running or finished experiment. Mutable state is guarded by {@code this}; the
 * {@link #view(boolean)} snapshot is what the API serializes.
 */
final class Experiment {

    enum Type {
        BENCHMARK,
        CORRECTNESS
    }

    enum Status {
        QUEUED,
        RUNNING,
        SUCCEEDED,
        FAILED,
        CANCELLED;

        boolean finished() {
            return this == SUCCEEDED || this == FAILED || this == CANCELLED;
        }
    }

    /** API representation. {@code result} is omitted from list views. */
    record View(
            String id,
            Type type,
            Status status,
            String createdAt,
            String startedAt,
            String finishedAt,
            int completedSteps,
            int totalSteps,
            String currentStep,
            String error,
            boolean cancelRequested,
            Object request,
            Object result) {}

    private final String id;
    private final Type type;
    private final Object request;
    private final Instant createdAt = Instant.now();
    private final AtomicBoolean cancelRequested = new AtomicBoolean();

    private Status status = Status.QUEUED;
    private Instant startedAt;
    private Instant finishedAt;
    private int completedSteps;
    private final int totalSteps;
    private String currentStep;
    private String error;
    private Object result;

    Experiment(String id, Type type, Object request, int totalSteps) {
        this.id = id;
        this.type = type;
        this.request = request;
        this.totalSteps = totalSteps;
    }

    String id() {
        return id;
    }

    Type type() {
        return type;
    }

    Object request() {
        return request;
    }

    Instant createdAt() {
        return createdAt;
    }

    boolean isCancelRequested() {
        return cancelRequested.get();
    }

    /** Requests cancellation; returns false if the experiment had already finished. */
    synchronized boolean requestCancel() {
        if (status.finished()) {
            return false;
        }
        cancelRequested.set(true);
        if (status == Status.QUEUED) {
            status = Status.CANCELLED;
            finishedAt = Instant.now();
        }
        return true;
    }

    /** Moves QUEUED to RUNNING; returns false if it was cancelled while queued. */
    synchronized boolean start() {
        if (status != Status.QUEUED) {
            return false;
        }
        status = Status.RUNNING;
        startedAt = Instant.now();
        return true;
    }

    synchronized void progress(int completed, String step) {
        completedSteps = completed;
        currentStep = step;
    }

    synchronized void succeed(Object result, boolean cancelled) {
        this.result = result;
        status = cancelled ? Status.CANCELLED : Status.SUCCEEDED;
        currentStep = null;
        finishedAt = Instant.now();
    }

    synchronized void fail(String message) {
        error = message;
        status = Status.FAILED;
        currentStep = null;
        finishedAt = Instant.now();
    }

    synchronized Status status() {
        return status;
    }

    synchronized Object result() {
        return result;
    }

    synchronized View view(boolean includeResult) {
        return new View(id, type, status, createdAt.toString(),
                startedAt == null ? null : startedAt.toString(),
                finishedAt == null ? null : finishedAt.toString(),
                completedSteps, totalSteps, currentStep, error, cancelRequested.get(), request,
                includeResult ? result : null);
    }
}
