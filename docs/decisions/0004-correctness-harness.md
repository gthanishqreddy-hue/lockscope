# 4. Own correctness harness with negative controls instead of jcstress

**Status:** accepted

jcstress is the gold standard for JMM litmus tests but needs its own build setup and does not
produce reports the dashboard can consume or that cover whole data-structure operations.

**Decision:** implement focused checks (lost update, overlap, partitioned reference, conservation,
bounded linearizability) that emit structured, seed-reproducible reports, and prove their power
with negative controls that must fail.

**Consequences:** the checks sample executions on the host's hardware memory model; they cannot
find bugs that only appear on weaker hardware. Adding jcstress tests for the locks is listed as a
next step.
