package io.lockscope.jcstress;

import static org.openjdk.jcstress.annotations.Expect.ACCEPTABLE;
import static org.openjdk.jcstress.annotations.Expect.FORBIDDEN;

import io.lockscope.lock.MutexLock;
import io.lockscope.lock.ClhLock;
import org.openjdk.jcstress.annotations.Actor;
import org.openjdk.jcstress.annotations.Arbiter;
import org.openjdk.jcstress.annotations.JCStressTest;
import org.openjdk.jcstress.annotations.Outcome;
import org.openjdk.jcstress.annotations.State;
import org.openjdk.jcstress.infra.results.I_Result;

/** Two threads increment a plain counter under the CLH; both increments must survive. */
@JCStressTest
@Outcome(id = "2", expect = ACCEPTABLE, desc = "Both increments survived")
@Outcome(id = "1", expect = FORBIDDEN, desc = "Lost update: the critical sections overlapped or a write was not visible")
@State
public class ClhIncrement {

    private final MutexLock lock = new ClhLock();
    private int counter; // plain field: only the lock orders the accesses

    @Actor
    public void actor1() {
        lock.lock();
        try {
            counter++;
        } finally {
            lock.unlock();
        }
    }

    @Actor
    public void actor2() {
        lock.lock();
        try {
            counter++;
        } finally {
            lock.unlock();
        }
    }

    @Arbiter
    public void arbiter(I_Result r) {
        r.r1 = counter;
    }
}
