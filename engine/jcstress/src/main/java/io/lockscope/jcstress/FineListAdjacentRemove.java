package io.lockscope.jcstress;

import static org.openjdk.jcstress.annotations.Expect.ACCEPTABLE;
import static org.openjdk.jcstress.annotations.Expect.FORBIDDEN;

import io.lockscope.set.ConcurrentSet;
import io.lockscope.set.FineList;
import org.openjdk.jcstress.annotations.Actor;
import org.openjdk.jcstress.annotations.Arbiter;
import org.openjdk.jcstress.annotations.JCStressTest;
import org.openjdk.jcstress.annotations.Outcome;
import org.openjdk.jcstress.annotations.State;
import org.openjdk.jcstress.infra.results.III_Result;

/** Fine-grained list: remove(1) and remove(2) unlink neighbouring nodes concurrently; both must be gone (r3 = membership bit mask afterwards). */
@JCStressTest
@Outcome(id = "1, 1, 0", expect = ACCEPTABLE, desc = "Both removed")
@Outcome(expect = FORBIDDEN, desc = "A removed element came back or a remove was reported wrongly")
@State
public class FineListAdjacentRemove {

    private final ConcurrentSet<Integer> set = new FineList<>();

    public FineListAdjacentRemove() {
        set.add(1);
        set.add(2);
    }

    @Actor
    public void actor1(III_Result r) {
        r.r1 = set.remove(1) ? 1 : 0;
    }

    @Actor
    public void actor2(III_Result r) {
        r.r2 = set.remove(2) ? 1 : 0;
    }

    @Arbiter
    public void arbiter(III_Result r) {
        r.r3 = (set.contains(1) ? 1 : 0) | (set.contains(2) ? 2 : 0);
    }
}
