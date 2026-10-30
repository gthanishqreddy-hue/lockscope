# Contributing

## Setup

```bash
scripts/dev-check              # JDK 17+, Node 20.19+ / 22+
cd engine && ./gradlew build   # compiles with -Werror and runs all engine tests
cd ../frontend && npm ci && npm run check
```

`scripts/test-all` runs everything CI runs.

## Ground rules

1. **Correctness before speed.** A new lock or set needs: contract tests, the lost-update/overlap
   (locks) or reference/conservation/linearizability (sets) checks, documented memory-ordering
   reasoning in its Javadoc, and an entry in `LockType`/`SetType`, `docs/algorithms.md` and
   `frontend/src/content/algorithms.ts`.
2. **No invented numbers.** Results in the repository come from real runs, with their environment
   recorded. Sample data is labelled as such everywhere.
3. **Never weaken a test to make it pass.** If a stress test is flaky, find out why.
4. **Keep the schema in sync.** A change to `engine/bench/.../model` needs the matching change in
   `frontend/src/schemas/results.ts`, and a new schema version if it is incompatible.
5. Java: 4-space indent, no new runtime dependencies in `engine/core`. TypeScript: strict mode, no
   `any`, Prettier formatting (`npm run format`).
