package io.lockscope.bench.jmh;

import io.lockscope.lock.LockType;
import io.lockscope.lock.MutexLock;
import org.openjdk.jmh.annotations.Benchmark;
import org.openjdk.jmh.annotations.Param;
import org.openjdk.jmh.annotations.Scope;
import org.openjdk.jmh.annotations.Setup;
import org.openjdk.jmh.annotations.State;
import org.openjdk.jmh.infra.Blackhole;

/**
 * One shared lock, contended by all benchmark threads.
 *
 * <p>Each operation does {@code nonCriticalWork} tokens of private work, then acquires the lock,
 * increments a shared counter, does {@code criticalWork} tokens of work and releases. The ratio of
 * the two controls contention: with no non-critical work the threads queue on the lock
 * continuously. Work is measured in {@link Blackhole#consumeCPU} tokens, whose duration depends on
 * the CPU; compare only results measured on the same machine.
 *
 * <p>Thread count is set by the runner ({@code -t}), not here. Every parameter is overridden by
 * {@link io.lockscope.bench.BenchmarkService}; the defaults only make the class runnable on its own.
 */
@State(Scope.Benchmark)
public class LockBenchmark {

    @Param({"ttas"})
    public String lock;

    @Param({"0"})
    public int criticalWork;

    @Param({"0"})
    public int nonCriticalWork;

    private MutexLock mutex;
    private long counter;

    @Setup
    public void setUp() {
        mutex = LockType.fromId(lock).create();
        counter = 0;
    }

    @Benchmark
    public void acquireRelease() {
        if (nonCriticalWork > 0) {
            Blackhole.consumeCPU(nonCriticalWork);
        }
        mutex.lock();
        try {
            counter++;
            if (criticalWork > 0) {
                Blackhole.consumeCPU(criticalWork);
            }
        } finally {
            mutex.unlock();
        }
    }
}
