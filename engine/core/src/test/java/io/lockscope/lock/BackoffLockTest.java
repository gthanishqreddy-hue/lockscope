package io.lockscope.lock;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class BackoffLockTest {

    @Test
    void limitDoublesUntilTheCap() {
        assertEquals(200, BackoffLock.nextLimit(100, 1_000));
        assertEquals(1_000, BackoffLock.nextLimit(600, 1_000));
        assertEquals(1_000, BackoffLock.nextLimit(1_000, 1_000));
    }

    @Test
    void limitNeverOverflows() {
        assertEquals(Long.MAX_VALUE, BackoffLock.nextLimit(Long.MAX_VALUE / 2 + 1, Long.MAX_VALUE));
        assertEquals(Long.MAX_VALUE, BackoffLock.nextLimit(Long.MAX_VALUE, Long.MAX_VALUE));
    }

    @Test
    void invalidParametersAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> new BackoffLock(0, 10));
        assertThrows(IllegalArgumentException.class, () -> new BackoffLock(-5, 10));
        assertThrows(IllegalArgumentException.class, () -> new BackoffLock(100, 10));
        assertThrows(IllegalArgumentException.class,
                () -> new BackoffLock(1, BackoffLock.MAX_ALLOWED_DELAY_NANOS + 1));
    }

    @Test
    void acceptsBoundaryParameters() {
        BackoffLock lock = new BackoffLock(1, BackoffLock.MAX_ALLOWED_DELAY_NANOS);
        lock.lock();
        lock.unlock();
        assertEquals(1, lock.minDelayNanos());
    }
}
