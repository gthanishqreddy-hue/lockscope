package io.lockscope.jcstress;

import static org.openjdk.jcstress.annotations.Expect.ACCEPTABLE;
import static org.openjdk.jcstress.annotations.Expect.FORBIDDEN;

import io.lockscope.lock.MutexLock;
import io.lockscope.lock.JdkReentrantLock;
import org.openjdk.jcstress.annotations.Actor;
import org.openjdk.jcstress.annotations.JCStressTest;
import org.openjdk.jcstress.annotations.Outcome;
import org.openjdk.jcstress.annotations.State;
import org.openjdk.jcstress.infra.results.II_Result;

/**
 * The writer sets two plain fields inside the fair ReentrantLock; the reader reads them inside the lock.
 * The reader must see both writes or neither, never one without the other.
 */
@JCStressTest
@Outcome(id = "0, 0", expect = ACCEPTABLE, desc = "Reader ran first")
@Outcome(id = "1, 1", expect = ACCEPTABLE, desc = "Reader ran second and saw both writes")
@Outcome(id = {"1, 0", "0, 1"}, expect = FORBIDDEN, desc = "Saw one write without the other: the critical sections were not atomic or not ordered")
@State
public class JdkReentrantFairVisibility {

    private final MutexLock lock = new JdkReentrantLock(true);
    private int x;
    private int y;

    @Actor
    public void writer() {
        lock.lock();
        try {
            x = 1;
            y = 1;
        } finally {
            lock.unlock();
        }
    }

    @Actor
    public void reader(II_Result r) {
        lock.lock();
        try {
            r.r1 = y;
            r.r2 = x;
        } finally {
            lock.unlock();
        }
    }
}
