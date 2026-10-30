package io.lockscope.lock;

import java.util.concurrent.atomic.AtomicReference;

/**
 * MCS queue lock (Mellor-Crummey and Scott).
 *
 * <p>An explicit linked queue: a thread swaps its node into {@code tail}; if there was a
 * predecessor, it links itself as the predecessor's {@code next} and spins on its <em>own</em>
 * node's {@code locked} flag. The owner hands the lock to its successor by clearing the
 * successor's flag. Each thread spins on memory it owns, which suits NUMA machines as well.
 *
 * <h2>The enqueue/link race</h2>
 * Between a successor's {@code getAndSet} on {@code tail} and its write of {@code pred.next},
 * the owner may try to release. It sees {@code next == null}, but {@code tail} no longer points at
 * its node, so its {@code compareAndSet(node, null)} fails. It must then wait for the successor to
 * finish linking before it can hand off. This short wait is why MCS release is not wait-free.
 *
 * <h2>Node lifecycle</h2>
 * Each thread reuses one node per lock. After {@code unlock()} returns, no other thread holds a
 * reference to it: either {@code tail} was reset to {@code null}, or the successor has been handed
 * the lock and only reads its own node. {@code next} is cleared before the node is reused.
 *
 * <h2>Memory ordering</h2>
 * {@code locked} and {@code next} are volatile and {@code tail} is an {@link AtomicReference}.
 * The owner's {@code successor.locked = false} synchronizes-with the successor's read that sees
 * {@code false}, so the previous critical section happens-before the next. In the uncontended
 * path the hand-over goes through {@code tail}: the releasing {@code compareAndSet} and the next
 * acquirer's {@code getAndSet} are volatile operations on the same variable.
 */
public final class McsLock extends AbstractOwnedLock {

    private static final LockProperties PROPERTIES = new LockProperties(
            false, false, false, LockProperties.Fairness.FIFO, LockProperties.Waiting.SPIN_LOCAL, "O(L + n)");

    static final class Node {
        volatile boolean locked;
        volatile Node next;
    }

    private final AtomicReference<Node> tail = new AtomicReference<>(null);
    private final ThreadLocal<Node> myNode = ThreadLocal.withInitial(Node::new);

    @Override
    public void lock() {
        checkNotOwner();
        Node node = myNode.get();
        node.next = null;
        node.locked = true;
        Node pred = tail.getAndSet(node);
        if (pred != null) {
            pred.next = node;
            while (node.locked) {
                Thread.onSpinWait();
            }
        }
        setOwner();
    }

    @Override
    public void unlock() {
        checkAndClearOwner();
        Node node = myNode.get();
        Node successor = node.next;
        if (successor == null) {
            if (tail.compareAndSet(node, null)) {
                return;
            }
            // A successor swapped itself into tail but has not linked itself yet.
            while ((successor = node.next) == null) {
                Thread.onSpinWait();
            }
        }
        node.next = null;
        successor.locked = false;
    }

    @Override
    public LockProperties properties() {
        return PROPERTIES;
    }
}
