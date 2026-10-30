package io.lockscope.set;

import io.lockscope.lock.JdkReentrantLock;
import io.lockscope.lock.MutexLock;
import java.util.ArrayList;
import java.util.List;

/**
 * Coarse-grained synchronization: one lock protects the whole list.
 *
 * <p>Every operation, including {@code contains} and {@code size}, runs entirely inside the
 * critical section, so the list behaves exactly like a sequential list and every operation is
 * linearizable at any point while the lock is held. The cost is that all operations are
 * serialized, readers included. Any {@link MutexLock} can be plugged in; the default is the
 * standard library's non-fair {@code ReentrantLock}.
 */
public final class CoarseList<E extends Comparable<? super E>> implements ConcurrentSet<E> {

    private static final SetProperties PROPERTIES = new SetProperties(
            SetProperties.Progress.BLOCKING, SetProperties.Progress.BLOCKING,
            "one lock for the whole list", true);

    private static final class Node<E> {
        final int kind;
        final E item;
        Node<E> next; // guarded by the list lock

        Node(int kind, E item) {
            this.kind = kind;
            this.item = item;
        }
    }

    private final Node<E> head = new Node<>(ListChecks.HEAD, null);
    private final MutexLock lock;

    public CoarseList() {
        this(new JdkReentrantLock(false));
    }

    public CoarseList(MutexLock lock) {
        this.lock = lock;
        head.next = new Node<>(ListChecks.TAIL, null);
    }

    @Override
    public boolean add(E item) {
        ListChecks.requireItem(item);
        lock.lock();
        try {
            Node<E> pred = head;
            Node<E> curr = pred.next;
            while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
                pred = curr;
                curr = curr.next;
            }
            if (ListChecks.compare(curr.kind, curr.item, item) == 0) {
                return false;
            }
            Node<E> node = new Node<>(ListChecks.ITEM, item);
            node.next = curr;
            pred.next = node;
            return true;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public boolean remove(E item) {
        ListChecks.requireItem(item);
        lock.lock();
        try {
            Node<E> pred = head;
            Node<E> curr = pred.next;
            while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
                pred = curr;
                curr = curr.next;
            }
            if (ListChecks.compare(curr.kind, curr.item, item) != 0) {
                return false;
            }
            pred.next = curr.next;
            return true;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public boolean contains(E item) {
        ListChecks.requireItem(item);
        lock.lock();
        try {
            Node<E> curr = head.next;
            while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
                curr = curr.next;
            }
            return ListChecks.compare(curr.kind, curr.item, item) == 0;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public int size() {
        lock.lock();
        try {
            int count = 0;
            for (Node<E> n = head.next; n.kind == ListChecks.ITEM; n = n.next) {
                count++;
            }
            return count;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public List<E> snapshot() {
        lock.lock();
        try {
            List<E> items = new ArrayList<>();
            for (Node<E> n = head.next; n.kind == ListChecks.ITEM; n = n.next) {
                items.add(n.item);
            }
            return items;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public List<String> checkInvariants() {
        lock.lock();
        try {
            List<String> violations = new ArrayList<>();
            E previous = null;
            Node<E> n = head.next;
            for (int steps = 0; n != null && n.kind == ListChecks.ITEM; steps++) {
                if (steps > ListChecks.MAX_CHECK_STEPS) {
                    violations.add("traversal did not reach the tail sentinel (cycle?)");
                    return violations;
                }
                ListChecks.checkOrder(previous, n.item, violations);
                previous = n.item;
                n = n.next;
            }
            if (n == null) {
                violations.add("list ends without a tail sentinel");
            }
            return violations;
        } finally {
            lock.unlock();
        }
    }

    @Override
    public SetProperties properties() {
        return PROPERTIES;
    }
}
