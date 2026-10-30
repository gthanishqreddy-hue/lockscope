# 1. Target Java 17 bytecode

**Status:** accepted

The specification asks for Java 21 or a compatible newer LTS. The development machine had only
JDK 17 installed, and nothing in LockScope needs a Java 21 API (records, switch expressions,
`Thread.onSpinWait`, `HexFormat` are all in 17).

**Decision:** compile with `--release 17`. The engine builds and runs on JDK 17, 21 and newer;
CI builds and tests on both 17 and 21.

**Consequences:** virtual threads (21) are not used. They would not suit spin-lock benchmarks
anyway, which need platform threads pinned to CPUs.
