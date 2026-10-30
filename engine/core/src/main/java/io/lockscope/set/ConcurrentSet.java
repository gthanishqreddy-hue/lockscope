package io.lockscope.set;

import java.util.List;

/**
 * A set of comparable elements backed by a sorted linked list, safe for concurrent use.
 *
 * <p>{@link #add}, {@link #remove} and {@link #contains} are linearizable in every
 * implementation; where each one takes effect is documented on the implementation class and in
 * {@code docs/algorithms.md}. Null elements are rejected with {@link NullPointerException}.
 *
 * <p>{@link #size()}, {@link #snapshot()} and {@link #checkInvariants()} are linearizable only in
 * the coarse-grained list (see {@link SetProperties#exactSize()}). In the other lists they are
 * weakly consistent while updates are running and exact once the set is quiescent, which is how
 * the test harness uses them.
 *
 * @param <E> element type; ordering comes from {@link Comparable#compareTo}, which must be
 *     consistent with equals for the set semantics to match {@link java.util.Set}
 */
public interface ConcurrentSet<E extends Comparable<? super E>> {

    /** Adds {@code item}; returns {@code true} if it was not already present. */
    boolean add(E item);

    /** Removes {@code item}; returns {@code true} if it was present. */
    boolean remove(E item);

    /** Returns whether {@code item} is present. */
    boolean contains(E item);

    /** Number of elements (see the class comment for consistency guarantees). */
    int size();

    /** Elements in list order (see the class comment for consistency guarantees). */
    List<E> snapshot();

    /**
     * Checks the structural invariants of the list and returns a description of every violation
     * found (empty when the list is well formed). Only meaningful when no updates are running.
     */
    List<String> checkInvariants();

    /** Static description of the guarantees this implementation provides. */
    SetProperties properties();
}
