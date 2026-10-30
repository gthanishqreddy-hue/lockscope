package io.lockscope.lock;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

/** Single-threaded and small multi-threaded contract tests for every real lock. */
class LockContractTest {

    static java.util.List<LockType> realLocks() {
        return LockType.realLocks();
    }

    static java.util.List<LockType> textbookLocks() {
        return LockType.realLocks().stream().filter(t -> t.category() == LockType.Category.TEXTBOOK).toList();
    }

    @ParameterizedTest
    @MethodSource("realLocks")
    void repeatedAcquireReleaseFromOneThread(LockType type) {
        MutexLock lock = type.create();
        for (int i = 0; i < 100_000; i++) {
            lock.lock();
            lock.unlock();
        }
    }

    @ParameterizedTest
    @MethodSource("realLocks")
    void unlockWithoutHoldingThrows(LockType type) {
        MutexLock lock = type.create();
        assertThrows(IllegalMonitorStateException.class, lock::unlock);
        // The failed unlock must not have corrupted the lock.
        lock.lock();
        lock.unlock();
    }

    @ParameterizedTest
    @MethodSource("realLocks")
    void unlockFromAnotherThreadThrowsAndKeepsOwnership(LockType type) throws Exception {
        MutexLock lock = type.create();
        lock.lock();
        AtomicReference<Throwable> thrown = new AtomicReference<>();
        Thread other = new Thread(() -> {
            try {
                lock.unlock();
            } catch (Throwable e) {
                thrown.set(e);
            }
        });
        other.start();
        other.join();
        assertTrue(thrown.get() instanceof IllegalMonitorStateException, "got " + thrown.get());
        lock.unlock();
    }

    @ParameterizedTest
    @MethodSource("textbookLocks")
    void textbookLocksRejectReentry(LockType type) {
        MutexLock lock = type.create();
        assertFalse(lock.properties().reentrant());
        lock.lock();
        assertThrows(IllegalMonitorStateException.class, lock::lock);
        lock.unlock();
        lock.lock(); // still usable
        lock.unlock();
    }

    @Test
    void jdkAdapterIsReentrant() {
        MutexLock lock = LockType.JDK_REENTRANT.create();
        assertTrue(lock.properties().reentrant());
        lock.lock();
        lock.lock();
        lock.unlock();
        lock.unlock();
        assertThrows(IllegalMonitorStateException.class, lock::unlock);
    }

    @ParameterizedTest
    @MethodSource("realLocks")
    void waiterAcquiresOnlyAfterRelease(LockType type) throws Exception {
        MutexLock lock = type.create();
        lock.lock();
        AtomicBoolean acquired = new AtomicBoolean();
        CountDownLatch started = new CountDownLatch(1);
        Thread waiter = new Thread(() -> {
            started.countDown();
            lock.lock();
            acquired.set(true);
            lock.unlock();
        });
        waiter.setDaemon(true);
        waiter.start();
        started.await();
        Thread.sleep(50);
        assertFalse(acquired.get(), "waiter entered while the lock was held");
        lock.unlock();
        waiter.join(TimeUnit.SECONDS.toMillis(10));
        assertTrue(acquired.get(), "waiter never acquired the released lock");
    }

    /** Ping-pong: each owner must see the value written by the previous owner. */
    @ParameterizedTest
    @MethodSource("realLocks")
    void ownershipHandOffPublishesWrites(LockType type) throws Exception {
        MutexLock lock = type.create();
        int rounds = 20_000;
        int[] box = new int[1]; // plain memory, protected only by the lock
        AtomicReference<String> failure = new AtomicReference<>();
        Runnable player = () -> {
            int seen = 0;
            while (seen < rounds && failure.get() == null) {
                lock.lock();
                try {
                    int value = box[0];
                    if (value < seen) {
                        failure.compareAndSet(null, "value went backwards: " + value + " after " + seen);
                    }
                    seen = value;
                    if (value < rounds) {
                        box[0] = value + 1;
                        seen = value + 1;
                    }
                } finally {
                    lock.unlock();
                }
            }
        };
        Thread a = new Thread(player);
        Thread b = new Thread(player);
        a.setDaemon(true);
        b.setDaemon(true);
        a.start();
        b.start();
        a.join(Duration.ofSeconds(30).toMillis());
        b.join(Duration.ofSeconds(30).toMillis());
        assertFalse(a.isAlive() || b.isAlive(), "players did not finish");
        assertEquals(null, failure.get());
        assertEquals(rounds, box[0]);
    }

    @ParameterizedTest
    @EnumSource(LockType.class)
    void everyLockDescribesItself(LockType type) {
        LockProperties properties = type.create().properties();
        assertNotNull(properties.fairness());
        assertNotNull(properties.waiting());
        assertEquals(type, LockType.fromId(type.id().toUpperCase()));
    }

    @Test
    void unknownLockIdIsRejected() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> LockType.fromId("nope"));
        assertTrue(e.getMessage().contains("tas"));
    }
}
