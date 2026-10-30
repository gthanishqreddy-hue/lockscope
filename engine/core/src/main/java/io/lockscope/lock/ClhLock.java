package io.lockscope.lock;

import java.util.concurrent.atomic.AtomicReference;

/**
 * CLH queue lock (Craig; Landin and Hagersten).
 *
 * <p>Waiting threads form an implicit queue: each thread swaps its own node into {@code tail},
 * remembers the node it replaced as its predecessor, and spins on the predecessor's
 * {@code locked} flag. Each thread spins on a different location, so a release invalidates only
 * one waiter's cache line, and the queue order makes the lock first-come-first-served from the
 * {@code getAndSet} on {@code tail}.
 *
 * <h2>Node lifecycle</h2>
 * On release a thread clears {@code locked} on its node and adopts its predecessor's node for its
 * next acquisition. That is safe: the predecessor's node was only ever read by this thread (its
 * unique successor), which has stopped spinning on it. The released node stays in use by our
 * successor until it acquires. Recycling a node any other way (for example reusing one's own node
 * immediately) would let a slow successor observe the wrong {@code locked} value. Java's garbage
 * collector reclaims nodes of threads that exit, so there is no manual reclamation.
 *
 * <h2>Memory ordering</h2>
 * {@code locked} is volatile. The owner's release writes {@code locked = false}; the successor's
 * spin read that observes {@code false} synchronizes-with it, so the previous critical section
 * happens-before the next. The successor's {@code locked = true} write is ordered before it is
 * published through the volatile {@code getAndSet} on {@code tail}.
 *
 * <p>The textbook version spins on a remote node, which is cheap on cache-coherent machines but
 * not on NUMA machines without coherent caches. Node bookkeeping uses {@link ThreadLocal}s; their
 * lookup cost is part of every measured acquisition.
 */
public final class ClhLock extends AbstractOwnedLock {

    private static final LockProperties PROPERTIES = new LockProperties(
            false, false, false, LockProperties.Fairness.FIFO, LockProperties.Waiting.SPIN_LOCAL, "O(L + n)");

    static final class Node {
        volatile boolean locked;
    }

    private final AtomicReference<Node> tail = new AtomicReference<>(new Node());
    private final ThreadLocal<Node> myNode = ThreadLocal.withInitial(Node::new);
    private final ThreadLocal<Node> myPred = new ThreadLocal<>();

    @Override
    public void lock() {
        checkNotOwner();
        Node node = myNode.get();
        node.locked = true;
        Node pred = tail.getAndSet(node);
        myPred.set(pred);
        while (pred.locked) {
            Thread.onSpinWait();
        }
        setOwner();
    }

    @Override
    public void unlock() {
        checkAndClearOwner();
        Node node = myNode.get();
        node.locked = false;
        myNode.set(myPred.get());
        myPred.set(null);
    }

    @Override
    public LockProperties properties() {
        return PROPERTIES;
    }
}
