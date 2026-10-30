# 3. Static-first dashboard, local-only engine

**Status:** accepted

Free hosting does not include always-on JVMs, and benchmarks on shared cloud machines would be
noisy and misleading anyway.

**Decision:** the dashboard is a static site that works fully from bundled datasets and imported
files. The engine runs on the user's machine; the dashboard connects to it at `127.0.0.1` when
available. Every dataset is labelled with its source (bundled sample, imported file, local engine).

**Consequences:** hosting costs nothing; new measurements require a local JDK. Bundled datasets are
real measurements from one machine and say so.
