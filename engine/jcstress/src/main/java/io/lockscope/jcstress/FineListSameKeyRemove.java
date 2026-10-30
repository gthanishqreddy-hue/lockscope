package io.lockscope.jcstress;

import static org.openjdk.jcstress.annotations.Expect.ACCEPTABLE;
import static org.openjdk.jcstress.annotations.Expect.FORBIDDEN;

import io.lockscope.set.ConcurrentSet;
import io.lockscope.set.FineList;
import org.openjdk.jcstress.annotations.Actor;
import org.openjdk.jcstress.annotations.JCStressTest;
import org.openjdk.jcstress.annotations.Outcome;
import org.openjdk.jcstress.annotations.State;
import org.openjdk.jcstress.infra.results.II_Result;

/** Fine-grained list: Two threads remove the only element: exactly one remove succeeds. */
@JCStressTest
@Outcome(id = "1, 0", expect = ACCEPTABLE, desc = "First remove won")
@Outcome(id = "0, 1", expect = ACCEPTABLE, desc = "Second remove won")
@Outcome(expect = FORBIDDEN, desc = "Both or neither remove succeeded")
@State
public class FineListSameKeyRemove {

    private final ConcurrentSet<Integer> set = new FineList<>();

    public FineListSameKeyRemove() {
        set.add(1);
    }

    @Actor
    public void actor1(II_Result r) {
        r.r1 = set.remove(1) ? 1 : 0;
    }

    @Actor
    public void actor2(II_Result r) {
        r.r2 = set.remove(1) ? 1 : 0;
    }
}
