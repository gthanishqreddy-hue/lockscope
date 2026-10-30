package io.lockscope.bench.model;

/**
 * Where a result was produced. Deliberately excludes host names, user names and paths.
 */
public record EnvironmentInfo(
        String lockscopeVersion,
        String javaVersion,
        String javaVendor,
        String vmName,
        String vmVersion,
        String osName,
        String osVersion,
        String osArch,
        int availableProcessors,
        long maxHeapMb,
        String jmhVersion) {

    public static final String LOCKSCOPE_VERSION = "0.1.0";

    public static EnvironmentInfo capture() {
        return new EnvironmentInfo(
                LOCKSCOPE_VERSION,
                System.getProperty("java.version"),
                System.getProperty("java.vendor"),
                System.getProperty("java.vm.name"),
                System.getProperty("java.vm.version"),
                System.getProperty("os.name"),
                System.getProperty("os.version"),
                System.getProperty("os.arch"),
                Runtime.getRuntime().availableProcessors(),
                Runtime.getRuntime().maxMemory() / (1024 * 1024),
                detectJmhVersion());
    }

    private static String detectJmhVersion() {
        Package p = org.openjdk.jmh.runner.Runner.class.getPackage();
        String version = p == null ? null : p.getImplementationVersion();
        return version != null ? version : "1.37";
    }
}
