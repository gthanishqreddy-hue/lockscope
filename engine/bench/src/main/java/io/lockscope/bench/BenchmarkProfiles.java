package io.lockscope.bench;

import io.lockscope.lock.LockType;
import io.lockscope.set.SetType;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Named, reusable workload profiles. Each is a starting point; every field can be overridden.
 * Work amounts are {@code Blackhole.consumeCPU} tokens (roughly a few nanoseconds each).
 */
public final class BenchmarkProfiles {

    /** Profile metadata for listing in the CLI and API. */
    public record Profile(String name, String kind, String description, BenchmarkRequest defaults) {}

    private static final Map<String, Profile> PROFILES = new LinkedHashMap<>();

    static {
        List<String> locks = LockType.realLocks().stream().map(LockType::id).toList();
        List<String> sets = Arrays.stream(SetType.values()).map(SetType::id).toList();
        List<Integer> threads = defaultThreadSweep();

        lock("lock-high-contention", "Threads compete continuously: tiny critical section, no private work.",
                locks, threads, 10, 0);
        lock("lock-moderate-contention", "Some private work between acquisitions.", locks, threads, 10, 200);
        lock("lock-low-contention", "Mostly private work; the lock is rarely contended.", locks, threads, 10, 2_000);
        lock("lock-short-cs", "Empty critical section: measures raw acquire/release hand-off.", locks, threads, 0, 0);
        lock("lock-long-cs", "Long critical section: waiting time dominates.", locks, threads, 500, 100);

        set("set-read-heavy", "90% contains, 5% add, 5% remove on 1024 keys.", sets, threads, 1_024, 90);
        set("set-balanced", "50% contains, 25% add, 25% remove on 1024 keys.", sets, threads, 1_024, 50);
        set("set-write-heavy", "10% contains, 45% add, 45% remove on 1024 keys.", sets, threads, 1_024, 10);
        set("set-small-high-contention", "Balanced mix on 64 keys: short list, threads collide often.", sets,
                threads, 64, 50);
        set("set-large", "Read-heavy mix on 8192 keys: long traversals, few collisions.", sets, threads, 8_192, 90);
    }

    private BenchmarkProfiles() {}

    /** Powers of two up to the number of available processors. */
    public static List<Integer> defaultThreadSweep() {
        int cpus = Runtime.getRuntime().availableProcessors();
        List<Integer> counts = new ArrayList<>();
        for (int t = 1; t <= cpus; t *= 2) {
            counts.add(t);
        }
        if (counts.get(counts.size() - 1) != cpus) {
            counts.add(cpus);
        }
        return counts;
    }

    public static List<Profile> all() {
        return List.copyOf(PROFILES.values());
    }

    public static Profile get(String name) {
        Profile profile = PROFILES.get(name);
        if (profile == null) {
            throw new IllegalArgumentException("Unknown profile '" + name + "'. Known: " + PROFILES.keySet());
        }
        return profile;
    }

    private static void lock(String name, String description, List<String> locks, List<Integer> threads,
            int criticalWork, int nonCriticalWork) {
        PROFILES.put(name, new Profile(name, "lock", description, new BenchmarkRequest("lock", name, locks, threads,
                criticalWork, nonCriticalWork, 1, 0, "thrpt", 2, 5, 1_000, 5, 1_000, true)));
    }

    private static void set(String name, String description, List<String> sets, List<Integer> threads,
            int keyRange, int readPercent) {
        PROFILES.put(name, new Profile(name, "set", description, new BenchmarkRequest("set", name, sets, threads,
                0, 0, keyRange, readPercent, "thrpt", 2, 5, 1_000, 5, 1_000, true)));
    }
}
