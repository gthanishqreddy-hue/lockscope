package io.lockscope.bench.jmh;

import io.lockscope.set.ConcurrentSet;
import io.lockscope.set.SetType;
import java.util.SplittableRandom;
import java.util.concurrent.atomic.AtomicLong;
import org.openjdk.jmh.annotations.Benchmark;
import org.openjdk.jmh.annotations.Param;
import org.openjdk.jmh.annotations.Scope;
import org.openjdk.jmh.annotations.Setup;
import org.openjdk.jmh.annotations.State;
import org.openjdk.jmh.infra.Blackhole;

/**
 * Mixed operations on one shared set.
 *
 * <p>Keys are drawn uniformly from {@code [0, keyRange)}. {@code readPercent} percent of
 * operations are {@code contains}; the rest are split evenly between {@code add} and
 * {@code remove}, so the set stays about half full (it is prefilled to half). The key range
 * controls both list length (traversal cost) and contention: fewer keys means more threads
 * working on the same nodes.
 */
@State(Scope.Benchmark)
public class SetBenchmark {

    @Param({"lazy"})
    public String set;

    @Param({"1024"})
    public int keyRange;

    @Param({"80"})
    public int readPercent;

    ConcurrentSet<Integer> target;
    Integer[] keys; // pre-boxed so the benchmark does not measure Integer allocation

    private final AtomicLong threadSeeds = new AtomicLong(0x5EEDL);

    @Setup
    public void setUp() {
        target = SetType.fromId(set).create();
        keys = new Integer[keyRange];
        for (int k = 0; k < keyRange; k++) {
            keys[k] = k;
        }
        SplittableRandom random = new SplittableRandom(42);
        for (int k = 0; k < keyRange; k++) {
            if (random.nextBoolean()) {
                target.add(keys[k]);
            }
        }
    }

    /** Per-thread random source; seeds are distinct per thread but fixed per trial. */
    @State(Scope.Thread)
    public static class ThreadRandom {
        SplittableRandom random;

        @Setup
        public void setUp(SetBenchmark benchmark) {
            random = new SplittableRandom(benchmark.threadSeeds.getAndIncrement());
        }
    }

    @Benchmark
    public void mixedOperation(ThreadRandom thread, Blackhole blackhole) {
        SplittableRandom random = thread.random;
        Integer key = keys[random.nextInt(keyRange)];
        int dice = random.nextInt(200);
        if (dice < readPercent * 2) {
            blackhole.consume(target.contains(key));
        } else if ((dice & 1) == 0) {
            blackhole.consume(target.add(key));
        } else {
            blackhole.consume(target.remove(key));
        }
    }
}
