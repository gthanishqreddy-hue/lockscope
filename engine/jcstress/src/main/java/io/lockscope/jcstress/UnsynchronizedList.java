package io.lockscope.jcstress;

import io.lockscope.set.ConcurrentSet;
import io.lockscope.set.SetProperties;
import java.util.ArrayList;
import java.util.List;

/**
 * Negative control for the set tests: a sorted list with no synchronization. Its races must show
 * up as "interesting" outcomes; if they never do, the set tests are too weak to trust.
 */
final class UnsynchronizedList implements ConcurrentSet<Integer> {

    private static final class Node {
        final int key;
        Node next;

        Node(int key, Node next) {
            this.key = key;
            this.next = next;
        }
    }

    private final Node head = new Node(Integer.MIN_VALUE, new Node(Integer.MAX_VALUE, null));

    @Override
    public boolean add(Integer item) {
        Node pred = head;
        Node curr = head.next;
        while (curr.key < item) {
            pred = curr;
            curr = curr.next;
        }
        if (curr.key == item) {
            return false;
        }
        pred.next = new Node(item, curr);
        return true;
    }

    @Override
    public boolean remove(Integer item) {
        Node pred = head;
        Node curr = head.next;
        while (curr.key < item) {
            pred = curr;
            curr = curr.next;
        }
        if (curr.key != item) {
            return false;
        }
        pred.next = curr.next;
        return true;
    }

    @Override
    public boolean contains(Integer item) {
        Node curr = head.next;
        while (curr.key < item) {
            curr = curr.next;
        }
        return curr.key == item;
    }

    @Override
    public int size() {
        return snapshot().size();
    }

    @Override
    public List<Integer> snapshot() {
        List<Integer> items = new ArrayList<>();
        for (Node n = head.next; n.key != Integer.MAX_VALUE; n = n.next) {
            items.add(n.key);
        }
        return items;
    }

    @Override
    public List<String> checkInvariants() {
        return List.of();
    }

    @Override
    public SetProperties properties() {
        return new SetProperties(SetProperties.Progress.WAIT_FREE, SetProperties.Progress.WAIT_FREE, "none", false);
    }
}
