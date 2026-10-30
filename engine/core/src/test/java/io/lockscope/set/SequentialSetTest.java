package io.lockscope.set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.SplittableRandom;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/** Single-threaded semantics of every set, compared with {@link TreeSet}. */
class SequentialSetTest {

    @ParameterizedTest
    @EnumSource(SetType.class)
    void basicMembership(SetType type) {
        ConcurrentSet<Integer> set = type.create();
        assertFalse(set.contains(5));
        assertTrue(set.add(5));
        assertFalse(set.add(5), "duplicate insert must fail");
        assertTrue(set.contains(5));
        assertTrue(set.remove(5));
        assertFalse(set.remove(5), "removing a missing element must fail");
        assertFalse(set.contains(5));
        assertEquals(0, set.size());
        assertTrue(set.checkInvariants().isEmpty());
    }

    @ParameterizedTest
    @EnumSource(SetType.class)
    void keepsElementsSorted(SetType type) {
        ConcurrentSet<Integer> set = type.create();
        for (int x : new int[] {5, 1, 9, 3, 7, 3, 1}) {
            set.add(x);
        }
        assertEquals(List.of(1, 3, 5, 7, 9), set.snapshot());
        assertEquals(5, set.size());
    }

    /** Sentinels are distinguished by kind, so the extreme integers are ordinary elements. */
    @ParameterizedTest
    @EnumSource(SetType.class)
    void extremeValuesAreOrdinaryElements(SetType type) {
        ConcurrentSet<Integer> set = type.create();
        assertTrue(set.add(Integer.MAX_VALUE));
        assertTrue(set.add(Integer.MIN_VALUE));
        assertTrue(set.add(0));
        assertEquals(List.of(Integer.MIN_VALUE, 0, Integer.MAX_VALUE), set.snapshot());
        assertTrue(set.remove(Integer.MIN_VALUE));
        assertTrue(set.remove(Integer.MAX_VALUE));
        assertEquals(List.of(0), set.snapshot());
    }

    @ParameterizedTest
    @EnumSource(SetType.class)
    void nullIsRejected(SetType type) {
        ConcurrentSet<Integer> set = type.create();
        assertThrows(NullPointerException.class, () -> set.add(null));
        assertThrows(NullPointerException.class, () -> set.remove(null));
        assertThrows(NullPointerException.class, () -> set.contains(null));
    }

    @ParameterizedTest
    @EnumSource(SetType.class)
    void randomOperationsMatchTreeSet(SetType type) {
        ConcurrentSet<Integer> set = type.create();
        TreeSet<Integer> reference = new TreeSet<>();
        SplittableRandom random = new SplittableRandom(2024);
        for (int i = 0; i < 20_000; i++) {
            int key = random.nextInt(200) - 100;
            switch (random.nextInt(3)) {
                case 0 -> assertEquals(reference.add(key), set.add(key), "add(" + key + ") at step " + i);
                case 1 -> assertEquals(reference.remove(key), set.remove(key), "remove(" + key + ") at step " + i);
                default -> assertEquals(reference.contains(key), set.contains(key), "contains(" + key + ")");
            }
        }
        assertEquals(new ArrayList<>(reference), set.snapshot());
        assertEquals(reference.size(), set.size());
        assertTrue(set.checkInvariants().isEmpty(), set.checkInvariants().toString());
    }

    @Test
    void worksWithNonIntegerComparables() {
        ConcurrentSet<String> set = new LazyList<>();
        set.add("pear");
        set.add("apple");
        set.add("fig");
        assertEquals(List.of("apple", "fig", "pear"), set.snapshot());
    }

    @Test
    void coarseListAcceptsAnyLabLock() {
        ConcurrentSet<Integer> set = new CoarseList<>(new io.lockscope.lock.McsLock());
        assertTrue(set.add(1));
        assertTrue(set.contains(1));
    }

    @Test
    void unknownSetIdIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> SetType.fromId("skiplist"));
        assertEquals(SetType.LOCK_FREE, SetType.fromId("LockFree"));
    }
}
