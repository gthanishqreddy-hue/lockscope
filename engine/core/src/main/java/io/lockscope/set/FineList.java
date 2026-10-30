package io.lockscope.set;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Fine-grained synchronization with hand-over-hand ("lock coupling") traversal.
 *
 * <p>Each node has its own lock. A thread always holds the lock of the node it is standing on
 * before locking the next one, and releases the earlier lock only after acquiring the later one.
 * Because every thread acquires node locks in list order (head to tail), no cycle of waiting can
 * form, so the list cannot deadlock. Holding both {@code pred} and {@code curr} when linking or
 * unlinking guarantees nobody else is modifying either node.
 *
 * <p>Linearization points: {@code add}/{@code remove}/{@code contains} take effect while holding
 * the locks on {@code pred} and {@code curr} at the final position (the write to
 * {@code pred.next} for successful updates). {@code next} fields are only read or written while
 * holding the owning node's lock, so they need not be volatile; the node locks provide the
 * happens-before ordering. Threads cannot overtake each other, so a slow thread near the head
 * delays everyone behind it.
 */
public final class FineList<E extends Comparable<? super E>> implements ConcurrentSet<E> {

    private static final SetProperties PROPERTIES = new SetProperties(
            SetProperties.Progress.BLOCKING, SetProperties.Progress.BLOCKING,
            "per-node locks, hand-over-hand", false);

    private static final class Node<E> {
        final int kind;
        final E item;
        final ReentrantLock lock = new ReentrantLock();
        Node<E> next; // guarded by this node's lock

        Node(int kind, E item) {
            this.kind = kind;
            this.item = item;
        }
    }

    private final Node<E> head = new Node<>(ListChecks.HEAD, null);

    public FineList() {
        head.next = new Node<>(ListChecks.TAIL, null);
    }

    @Override
    public boolean add(E item) {
        ListChecks.requireItem(item);
        head.lock.lock();
        Node<E> pred = head;
        try {
            Node<E> curr = pred.next;
            curr.lock.lock();
            try {
                while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
                    pred.lock.unlock();
                    pred = curr;
                    curr = curr.next;
                    curr.lock.lock();
                }
                if (ListChecks.compare(curr.kind, curr.item, item) == 0) {
                    return false;
                }
                Node<E> node = new Node<>(ListChecks.ITEM, item);
                node.next = curr;
                pred.next = node;
                return true;
            } finally {
                curr.lock.unlock();
            }
        } finally {
            pred.lock.unlock();
        }
    }

    @Override
    public boolean remove(E item) {
        ListChecks.requireItem(item);
        head.lock.lock();
        Node<E> pred = head;
        try {
            Node<E> curr = pred.next;
            curr.lock.lock();
            try {
                while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
                    pred.lock.unlock();
                    pred = curr;
                    curr = curr.next;
                    curr.lock.lock();
                }
                if (ListChecks.compare(curr.kind, curr.item, item) != 0) {
                    return false;
                }
                pred.next = curr.next;
                return true;
            } finally {
                curr.lock.unlock();
            }
        } finally {
            pred.lock.unlock();
        }
    }

    @Override
    public boolean contains(E item) {
        ListChecks.requireItem(item);
        head.lock.lock();
        Node<E> pred = head;
        try {
            Node<E> curr = pred.next;
            curr.lock.lock();
            try {
                while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
                    pred.lock.unlock();
                    pred = curr;
                    curr = curr.next;
                    curr.lock.lock();
                }
                return ListChecks.compare(curr.kind, curr.item, item) == 0;
            } finally {
                curr.lock.unlock();
            }
        } finally {
            pred.lock.unlock();
        }
    }

    @Override
    public int size() {
        return snapshot().size();
    }

    /** Hand-over-hand traversal; each element was present when its node was visited. */
    @Override
    public List<E> snapshot() {
        List<E> items = new ArrayList<>();
        Node<E> curr = head;
        curr.lock.lock();
        while (curr.kind != ListChecks.TAIL) {
            Node<E> next = curr.next;
            next.lock.lock();
            curr.lock.unlock();
            curr = next;
            if (curr.kind == ListChecks.ITEM) {
                items.add(curr.item);
            }
        }
        curr.lock.unlock();
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
                violations.add("node " + describe(n) + " is still locked in a quiescent list");
            }
            if (n.kind == ListChecks.ITEM) {
                ListChecks.checkOrder(previous, n.item, violations);
                previous = n.item;
            }
            n = n.next;
        }
        if (n == null) {
            violations.add("list ends without a tail sentinel");
        } else if (n.lock.isLocked()) {
            violations.add("tail sentinel is still locked in a quiescent list");
        }
        return violations;
    }

    @Override
    public SetProperties properties() {
        return PROPERTIES;
    }

    private static String describe(Node<?> n) {
        return n.kind == ListChecks.HEAD ? "<head>" : String.valueOf(n.item);
    }
}
