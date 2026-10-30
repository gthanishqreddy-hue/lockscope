package io.lockscope.jcstress;

import static org.openjdk.jcstress.annotations.Expect.ACCEPTABLE;
import static org.openjdk.jcstress.annotations.Expect.ACCEPTABLE_INTERESTING;

import io.lockscope.set.ConcurrentSet;
import org.openjdk.jcstress.annotations.Actor;
import org.openjdk.jcstress.annotations.Arbiter;
import org.openjdk.jcstress.annotations.JCStressTest;
import org.openjdk.jcstress.annotations.Outcome;
import org.openjdk.jcstress.annotations.State;
import org.openjdk.jcstress.infra.results.III_Result;

/** Unsynchronized control list: add(1) and add(2) insert into the same gap of an empty list; both must survive (r3 = membership bit mask afterwards). */
@JCStressTest
@Outcome(id = "1, 1, 3", expect = ACCEPTABLE, desc = "Both inserted and present")
@Outcome(expect = ACCEPTABLE_INTERESTING, desc = "An insert was lost or reported wrongly, as expected for the negative control")
@State
public class UnsyncListAdjacentAdd {

    private final ConcurrentSet<Integer> set = new UnsynchronizedList();

    @Actor
    public void actor1(III_Result r) {
        r.r1 = set.add(1) ? 1 : 0;
    }

    @Actor
    public void actor2(III_Result r) {
        r.r2 = set.add(2) ? 1 : 0;
    }

    @Arbiter
    public void arbiter(III_Result r) {
        r.r3 = (set.contains(1) ? 1 : 0) | (set.contains(2) ? 2 : 0);
    }
}
