package io.lockscope.bench.cli;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Minimal {@code --name value} / {@code --flag} parser that rejects unknown options. */
final class Args {

    private final Map<String, String> values = new HashMap<>();
    private final Set<String> flags = new HashSet<>();
    private final Set<String> used = new HashSet<>();

    Args(String[] argv, Set<String> knownFlags) {
        for (int i = 0; i < argv.length; i++) {
            String token = argv[i];
            if (!token.startsWith("--") || token.length() < 3) {
                throw new IllegalArgumentException("unexpected argument '" + token + "'");
            }
            String name = token.substring(2);
            if (knownFlags.contains(name)) {
                flags.add(name);
            } else {
                if (i + 1 >= argv.length) {
                    throw new IllegalArgumentException("--" + name + " needs a value");
                }
                values.put(name, argv[++i]);
            }
        }
    }

    String string(String name, String fallback) {
        used.add(name);
        return values.getOrDefault(name, fallback);
    }

    boolean has(String name) {
        return values.containsKey(name);
    }

    boolean flag(String name) {
        used.add(name);
        return flags.contains(name);
    }

    int integer(String name, int fallback) {
        long value = longValue(name, fallback);
        if (value < Integer.MIN_VALUE || value > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("--" + name + " is out of range");
        }
        return (int) value;
    }

    long longValue(String name, long fallback) {
        used.add(name);
        String raw = values.get(name);
        if (raw == null) {
            return fallback;
        }
        try {
            return Long.parseLong(raw.trim().replace("_", ""));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("--" + name + " must be a whole number, got '" + raw + "'");
        }
    }

    List<String> list(String name, List<String> fallback) {
        used.add(name);
        String raw = values.get(name);
        if (raw == null) {
            return fallback;
        }
        return Arrays.stream(raw.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    List<Integer> intList(String name, List<Integer> fallback) {
        List<String> raw = list(name, null);
        if (raw == null) {
            return fallback;
        }
        List<Integer> out = new ArrayList<>();
        for (String s : raw) {
            try {
                out.add(Integer.parseInt(s));
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("--" + name + " must be a comma-separated list of numbers");
            }
        }
        return out;
    }

    /** Fails if an option was given that no part of the command read. */
    void rejectUnused() {
        Set<String> unknown = new HashSet<>(values.keySet());
        unknown.addAll(flags);
        unknown.removeAll(used);
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException("unknown option(s): " + unknown.stream().map(s -> "--" + s).toList());
        }
    }
}
