package io.lockscope.set;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicMarkableReference;

/**
 * Lock-free list (Harris; Michael), using {@link AtomicMarkableReference}.
 *
 * <p>A node's deletion mark lives in the same atomic word as its {@code next} reference, so a
 * single compare-and-set can check "this node is not deleted and still points to {@code succ}".
 * This is what prevents an insertion after a node that is concurrently being removed.
 *
 * <ul>
 *   <li>{@code remove} marks {@code curr.next} (logical removal, the linearization point), then
 *       makes one attempt to unlink {@code curr}. If that fails, a later {@code find} unlinks it.
 *   <li>{@code find} returns a window {@code (pred, curr)} with {@code curr} the first node not
 *       smaller than the item. Along the way it helps by unlinking ("snipping") every marked node
 *       it meets; if a snip fails, the window is stale and the search restarts from the head.
 *   <li>{@code add} links a new node with a compare-and-set on {@code pred.next} expecting
 *       {@code (curr, unmarked)} (the linearization point); on failure it retries.
 *   <li>{@code contains} never writes or retries, so it is wait-free.
 * </ul>
 *
 * <p>Progress: {@code add} and {@code remove} are lock-free (a failed compare-and-set means
 * another thread's succeeded) but not wait-free. ABA: a compare-and-set compares references, and
 * a Java object cannot be recycled at the same address while any thread still references it, so
 * the classic ABA scenario from manual memory reclamation does not arise. The cost of this
 * convenience is an allocation of an internal pair object on every {@code next} update.
 */
public final class LockFreeList<E extends Comparable<? super E>> implements ConcurrentSet<E> {

    private static final SetProperties PROPERTIES = new SetProperties(
            SetProperties.Progress.LOCK_FREE, SetProperties.Progress.WAIT_FREE,
            "compare-and-set on (next, mark) pairs, cooperative unlinking", false);

    private static final class Node<E> {
        final int kind;
        final E item;
        final AtomicMarkableReference<Node<E>> next;

        Node(int kind, E item, Node<E> next) {
            this.kind = kind;
            this.item = item;
            this.next = new AtomicMarkableReference<>(next, false);
        }
    }

    private record Window<E>(Node<E> pred, Node<E> curr) {}

    private final Node<E> head;

    public LockFreeList() {
        head = new Node<>(ListChecks.HEAD, null, new Node<>(ListChecks.TAIL, null, null));
    }

    private Window<E> find(E item) {
        boolean[] marked = {false};
        retry:
        while (true) {
            Node<E> pred = head;
            Node<E> curr = pred.next.getReference();
            while (true) {
                Node<E> succ = curr.next.get(marked);
                while (marked[0]) {
                    if (!pred.next.compareAndSet(curr, succ, false, false)) {
                        continue retry;
                    }
                    curr = succ;
                    succ = curr.next.get(marked);
                }
                if (ListChecks.compare(curr.kind, curr.item, item) >= 0) {
                    return new Window<>(pred, curr);
                }
                pred = curr;
                curr = succ;
            }
        }
    }

    @Override
    public boolean add(E item) {
        ListChecks.requireItem(item);
        while (true) {
            Window<E> window = find(item);
            Node<E> curr = window.curr();
            if (ListChecks.compare(curr.kind, curr.item, item) == 0) {
                return false;
            }
            Node<E> node = new Node<>(ListChecks.ITEM, item, curr);
            if (window.pred().next.compareAndSet(curr, node, false, false)) {
                return true;
            }
        }
    }

    @Override
    public boolean remove(E item) {
        ListChecks.requireItem(item);
        while (true) {
            Window<E> window = find(item);
            Node<E> curr = window.curr();
            if (ListChecks.compare(curr.kind, curr.item, item) != 0) {
                return false;
            }
            Node<E> succ = curr.next.getReference();
            if (!curr.next.compareAndSet(succ, succ, false, true)) {
                continue; // succ changed or curr was marked by someone else; re-evaluate
            }
            window.pred().next.compareAndSet(curr, succ, false, false);
            return true;
        }
    }

    @Override
    public boolean contains(E item) {
        ListChecks.requireItem(item);
        Node<E> curr = head;
        while (ListChecks.compare(curr.kind, curr.item, item) < 0) {
            curr = curr.next.getReference();
        }
        return ListChecks.compare(curr.kind, curr.item, item) == 0 && !curr.next.isMarked();
    }

    @Override
    public int size() {
        return snapshot().size();
    }

    @Override
    public List<E> snapshot() {
        List<E> items = new ArrayList<>();
        for (Node<E> n = head.next.getReference(); n.kind == ListChecks.ITEM; n = n.next.getReference()) {
            if (!n.next.isMarked()) {
                items.add(n.item);
            }
        }
        return items;
    }

    /**
     * Marked nodes may legitimately remain reachable after quiescence (a failed unlink is left to
     * the next {@code find}), so they are not a violation; the order must still be strict.
     */
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
            if (n.kind == ListChecks.ITEM) {
                ListChecks.checkOrder(previous, n.item, violations);
                previous = n.item;
            }
            n = n.next.getReference();
        }
        if (n == null) {
            violations.add("list ends without a tail sentinel");
        }
        if (head.next.isMarked()) {
            violations.add("head sentinel is marked");
        }
        return violations;
    }

    @Override
    public SetProperties properties() {
        return PROPERTIES;
    }
}
