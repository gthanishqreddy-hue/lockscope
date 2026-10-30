package io.lockscope.bench;

import java.security.SecureRandom;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;

/** Generates sortable, collision-resistant identifiers such as {@code bench-20261030T101500Z-3fa2c1}. */
public final class Ids {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");

    private Ids() {}

    public static String newId(String prefix) {
        byte[] suffix = new byte[3];
        RANDOM.nextBytes(suffix);
        return prefix + "-" + ZonedDateTime.now(ZoneOffset.UTC).format(STAMP) + "-" + HexFormat.of().formatHex(suffix);
    }

    /** Whether {@code id} has the shape produced by {@link #newId}; used to validate path input. */
    public static boolean isValid(String id) {
        return id != null && id.matches("[a-z]{1,16}-\\d{8}T\\d{6}Z-[0-9a-f]{6}");
    }
}
