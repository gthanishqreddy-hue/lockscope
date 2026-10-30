package io.lockscope.correctness;

import static io.lockscope.correctness.SetLinearizabilityChecker.OpType.ADD;
import static io.lockscope.correctness.SetLinearizabilityChecker.OpType.CONTAINS;
import static io.lockscope.correctness.SetLinearizabilityChecker.OpType.REMOVE;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.lockscope.correctness.SetLinearizabilityChecker.Op;
import io.lockscope.correctness.SetLinearizabilityChecker.Verdict;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Hand-built histories with known answers. */
class SetLinearizabilityCheckerTest {

    @Test
    void sequentialHistoryIsLinearizable() {
        List<Op> history = List.of(
                new Op(0, ADD, 1, true, 0, 1),
                new Op(0, CONTAINS, 1, true, 2, 3),
                new Op(0, REMOVE, 1, true, 4, 5),
                new Op(0, CONTAINS, 1, false, 6, 7));
        assertTrue(SetLinearizabilityChecker.check(history, Set.of()).linearizable());
    }

    @Test
    void overlappingOperationsMayBeReordered() {
        // contains overlaps the add, so it may observe either state.
        List<Op> history = List.of(
                new Op(0, ADD, 1, true, 0, 3),
                new Op(1, CONTAINS, 1, true, 1, 2));
        assertTrue(SetLinearizabilityChecker.check(history, Set.of()).linearizable());
        List<Op> history2 = List.of(
                new Op(0, ADD, 1, true, 0, 3),
                new Op(1, CONTAINS, 1, false, 1, 2));
        assertTrue(SetLinearizabilityChecker.check(history2, Set.of()).linearizable());
    }

    @Test
    void staleReadAfterCompletedAddIsRejected() {
        // The add finished before the contains started, so contains must see the element.
        List<Op> history = List.of(
                new Op(0, ADD, 1, true, 0, 1),
                new Op(1, CONTAINS, 1, false, 2, 3));
        Verdict verdict = SetLinearizabilityChecker.check(history, Set.of());
        assertFalse(verdict.linearizable());
        assertFalse(verdict.inconclusive());
        assertEquals(1, verdict.failingKey());
    }

    @Test
    void twoSuccessfulConcurrentAddsAreRejected() {
        List<Op> history = List.of(
                new Op(0, ADD, 4, true, 0, 3),
                new Op(1, ADD, 4, true, 1, 2));
        assertFalse(SetLinearizabilityChecker.check(history, Set.of()).linearizable());
    }

    @Test
    void initialStateIsRespected() {
        List<Op> history = List.of(new Op(0, ADD, 2, false, 0, 1));
        assertTrue(SetLinearizabilityChecker.check(history, Set.of(2)).linearizable());
        assertFalse(SetLinearizabilityChecker.check(history, Set.of()).linearizable());
    }

    @Test
    void keysAreCheckedIndependently() {
        List<Op> history = List.of(
                new Op(0, ADD, 1, true, 0, 1),
                new Op(1, ADD, 2, true, 0, 1),
                new Op(0, REMOVE, 2, true, 2, 3),
                new Op(1, REMOVE, 1, true, 2, 3));
        assertTrue(SetLinearizabilityChecker.check(history, Set.of()).linearizable());
    }

    @Test
    void oversizedKeyHistoryIsInconclusiveNotPassed() {
        List<Op> history = new ArrayList<>();
        for (int i = 0; i <= SetLinearizabilityChecker.MAX_OPS_PER_KEY; i++) {
            history.add(new Op(0, CONTAINS, 0, false, 2L * i, 2L * i + 1));
        }
        Verdict verdict = SetLinearizabilityChecker.check(history, Set.of());
        assertTrue(verdict.inconclusive());
        assertFalse(verdict.linearizable());
    }

    @Test
    void largeConcurrentLinearizableHistoryIsCheckedQuickly() {
        // 6 threads, all overlapping, alternating add/remove successes: linearizable.
        List<Op> history = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            history.add(new Op(i % 6, i % 2 == 0 ? ADD : REMOVE, 0, true, i, 1000 + i));
        }
        assertTrue(SetLinearizabilityChecker.check(history, Set.of()).linearizable());
    }
}
