package io.lockscope.set;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Optimistic synchronization.
 *
 * <p>A thread searches without taking any locks, then locks only {@code pred} and {@code curr} and
 * <em>validates</em> that the window is still valid: {@code pred} is still reachable from the head
 * and still points to {@code curr}. If validation fails (a concurrent update changed the window),
 * the thread releases both locks and starts over. Validation re-traverses the list, so every
 * successful operation traverses it twice.
 *
 * <p>Why the unlocked traversal is safe in Java: removal only redirects {@code pred.next} and
 * leaves the removed node's {@code next} intact, so a thread standing on a removed node still
 * reaches the tail; nodes are never freed while referenced (garbage collection); and {@code next}
 * is volatile, so a node's final fields and its {@code next} are visible to any thread that
 * reaches it through a {@code next} read. Locks are always taken in list order, so there is no
 * deadlock. Operations can be retried indefinitely under constant interference, so they are not
 * starvation-free. {@code contains} also locks and validates in this textbook variant.
 */
public final class OptimisticList<E extends Comparable<? super E>> implements ConcurrentSet<E> {

    private static final SetProperties PROPERTIES = new SetProperties(
            SetProperties.Progress.BLOCKING, SetProperties.Progress.BLOCKING,
            "lock-free search, lock pred+curr, validate by re-traversal", false);

    private static final class Node<E> {
        final int kind;
        final E item;
        final ReentrantLock lock = new ReentrantLock();
        volatile Node<E> next;

        Node(int kind, E item) {
            this.kind = kind;
            this.item = item;
        }
    }

    private final Node<E> head = new Node<>(ListChecks.HEAD, null);

    public OptimisticList() {
        head.next = new Node<>(ListChecks.TAIL, null);
    }

    @Override
    public boolean add(E item) {
        ListChecks.requireItem(item);
        while (true) {
            Node<E> pred = head;
            Node<E> curr = pred.next;
            while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
                pred = curr;
                curr = curr.next;
            }
            pred.lock.lock();
            try {
                curr.lock.lock();
                try {
                    if (validate(pred, curr)) {
                        if (ListChecks.compare(curr.kind, curr.item, item) == 0) {
                            return false;
                        }
                        Node<E> node = new Node<>(ListChecks.ITEM, item);
                        node.next = curr;
                        pred.next = node;
                        return true;
                    }
                } finally {
                    curr.lock.unlock();
                }
            } finally {
                pred.lock.unlock();
            }
        }
    }

    @Override
    public boolean remove(E item) {
        ListChecks.requireItem(item);
        while (true) {
            Node<E> pred = head;
            Node<E> curr = pred.next;
            while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
                pred = curr;
                curr = curr.next;
            }
            pred.lock.lock();
            try {
                curr.lock.lock();
                try {
                    if (validate(pred, curr)) {
                        if (ListChecks.compare(curr.kind, curr.item, item) != 0) {
                            return false;
                        }
                        pred.next = curr.next;
                        return true;
                    }
                } finally {
                    curr.lock.unlock();
                }
            } finally {
                pred.lock.unlock();
            }
        }
    }

    @Override
    public boolean contains(E item) {
        ListChecks.requireItem(item);
        while (true) {
            Node<E> pred = head;
            Node<E> curr = pred.next;
            while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
                pred = curr;
                curr = curr.next;
            }
            pred.lock.lock();
            try {
                curr.lock.lock();
                try {
                    if (validate(pred, curr)) {
                        return ListChecks.compare(curr.kind, curr.item, item) == 0;
                    }
                } finally {
                    curr.lock.unlock();
                }
            } finally {
                pred.lock.unlock();
            }
        }
    }

    /** Must be called holding the locks of {@code pred} and {@code curr}. */
    private boolean validate(Node<E> pred, Node<E> curr) {
        Node<E> node = head;
        while (ListChecks.compareNodes(node.kind, node.item, pred.kind, pred.item) <= 0) {
            if (node == pred) {
                return pred.next == curr;
            }
            node = node.next;
        }
        return false;
    }

    @Override
    public int size() {
        return snapshot().size();
    }

    @Override
    public List<E> snapshot() {
        List<E> items = new ArrayList<>();
        for (Node<E> n = head.next; n.kind == ListChecks.ITEM; n = n.next) {
            items.add(n.item);
        }
        return items;
    }

    @Override
    public List<String> checkInvariants() {
        List<String> violations = new ArrayList<>();
        E previous = null;
        Node<E> n = head;
        for (int steps = 0; n != null && n.kind != ListChecks.TAIL; steps++) {
            if (steps > ListChecks.MAX_CHECK_STEPS) {
                violations.add("traversal did not reach the tail sentinel (cycle?)");
                return violations;
            }
            if (n.lock.isLocked()) {
                violations.add("a node is still locked in a quiescent list");
            }
            if (n.kind == ListChecks.ITEM) {
                ListChecks.checkOrder(previous, n.item, violations);
                previous = n.item;
            }
            n = n.next;
        }
        if (n == null) {
            violations.add("list ends without a tail sentinel");
        }
        return violations;
    }

    @Override
    public SetProperties properties() {
        return PROPERTIES;
    }
}
