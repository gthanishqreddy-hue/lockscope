package io.lockscope.set;

import java.util.ArrayList;
import java.util.List;

/**
 * Test-only negative control: a sorted list with no synchronization at all. The concurrent checks
 * must report it as broken; if they do not, they are too weak to trust.
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
        Thread.yield(); // widen the race window
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
        Thread.yield();
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
