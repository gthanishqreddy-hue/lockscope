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

/** Fine-grained list: add(1) races remove(1) on an empty set; results must match a serial order (r3 = contains(1) afterwards). */
@JCStressTest
@Outcome(id = "1, 1, 0", expect = ACCEPTABLE, desc = "add then remove")
@Outcome(id = "1, 0, 1", expect = ACCEPTABLE, desc = "remove (failed) then add")
@Outcome(expect = FORBIDDEN, desc = "Results match no serial order")
@State
public class FineListAddRemove {

    private final ConcurrentSet<Integer> set = new FineList<>();

    @Actor
    public void actor1(III_Result r) {
        r.r1 = set.add(1) ? 1 : 0;
    }

    @Actor
    public void actor2(III_Result r) {
        r.r2 = set.remove(1) ? 1 : 0;
    }

    @Arbiter
    public void arbiter(III_Result r) {
        r.r3 = set.contains(1) ? 1 : 0;
    }
}
