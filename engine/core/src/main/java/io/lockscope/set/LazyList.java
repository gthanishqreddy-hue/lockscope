package io.lockscope.set;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Lazy synchronization: logical deletion followed by physical unlinking.
 *
 * <p>Each node has a {@code marked} flag. {@code remove} first sets {@code marked} (logical
 * removal: from this moment the element is not in the set), then redirects {@code pred.next}
 * (physical removal: the node becomes unreachable). Splitting the two lets validation be local
 * instead of re-traversing: with {@code pred} and {@code curr} locked, the window is valid iff
 * neither node is marked and {@code pred.next == curr}. A node that is reachable and unmarked is
 * in the set.
 *
 * <p>Linearization points: a successful {@code remove} at the write {@code curr.marked = true};
 * a successful {@code add} at the write {@code pred.next = node}; unsuccessful updates when the
 * locks are held and validation succeeded. {@code contains} takes no locks and never retries (it
 * is wait-free); it linearizes when it reads {@code marked} on the node it found, or, if the node
 * it found was already unlinked when it reached it, at the moment just before the element was
 * logically removed or inserted elsewhere, as argued by Herlihy and Shavit (ch. 9.7).
 *
 * <p>{@code next} and {@code marked} are volatile so that the unlocked traversal and
 * {@code contains} see writes made under the node locks.
 */
public final class LazyList<E extends Comparable<? super E>> implements ConcurrentSet<E> {

    private static final SetProperties PROPERTIES = new SetProperties(
            SetProperties.Progress.BLOCKING, SetProperties.Progress.WAIT_FREE,
            "lock-free search, lock pred+curr, mark then unlink", false);

    private static final class Node<E> {
        final int kind;
        final E item;
        final ReentrantLock lock = new ReentrantLock();
        volatile Node<E> next;
        volatile boolean marked;

        Node(int kind, E item) {
            this.kind = kind;
            this.item = item;
        }
    }

    private final Node<E> head = new Node<>(ListChecks.HEAD, null);

    public LazyList() {
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
                        curr.marked = true; // logical removal
                        pred.next = curr.next; // physical removal
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
        Node<E> curr = head;
        while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
            curr = curr.next;
        }
        return ListChecks.compare(curr.kind, curr.item, item) == 0 && !curr.marked;
    }

    private static <E> boolean validate(Node<E> pred, Node<E> curr) {
        return !pred.marked && !curr.marked && pred.next == curr;
    }

    @Override
    public int size() {
        return snapshot().size();
    }

    @Override
    public List<E> snapshot() {
        List<E> items = new ArrayList<>();
        for (Node<E> n = head.next; n.kind == ListChecks.ITEM; n = n.next) {
            if (!n.marked) {
                items.add(n.item);
            }
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
                if (n.marked) {
                    violations.add("marked node " + n.item + " is still reachable after quiescence");
                }
                ListChecks.checkOrder(previous, n.item, violations);
                previous = n.item;
            }
            n = n.next;
        }
        if (n == null) {
            violations.add("list ends without a tail sentinel");
        }
        if (head.marked) {
            violations.add("head sentinel is marked");
        }
        return violations;
    }

    @Override
    public SetProperties properties() {
        return PROPERTIES;
    }
}
