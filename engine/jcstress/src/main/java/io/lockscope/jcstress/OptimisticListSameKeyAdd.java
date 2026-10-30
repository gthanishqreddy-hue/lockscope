package io.lockscope.jcstress;

import static org.openjdk.jcstress.annotations.Expect.ACCEPTABLE;
import static org.openjdk.jcstress.annotations.Expect.FORBIDDEN;

import io.lockscope.set.ConcurrentSet;
import io.lockscope.set.OptimisticList;
import org.openjdk.jcstress.annotations.Actor;
import org.openjdk.jcstress.annotations.JCStressTest;
import org.openjdk.jcstress.annotations.Outcome;
import org.openjdk.jcstress.annotations.State;
import org.openjdk.jcstress.infra.results.II_Result;

/** Optimistic list: Two threads add the same key to an empty set: exactly one add succeeds. */
@JCStressTest
@Outcome(id = "1, 0", expect = ACCEPTABLE, desc = "First add won")
@Outcome(id = "0, 1", expect = ACCEPTABLE, desc = "Second add won")
@Outcome(expect = FORBIDDEN, desc = "Both or neither add succeeded")
@State
public class OptimisticListSameKeyAdd {

    private final ConcurrentSet<Integer> set = new OptimisticList<>();

    @Actor
    public void actor1(II_Result r) {
        r.r1 = set.add(1) ? 1 : 0;
    }

    @Actor
    public void actor2(II_Result r) {
        r.r2 = set.add(1) ? 1 : 0;
    }
}
