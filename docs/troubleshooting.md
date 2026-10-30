# Troubleshooting

| Problem | Cause and fix |
|---|---|
| `./gradlew` hangs or fails with `Connect timed out` while downloading Gradle or dependencies | Some networks time out on IPv6. The project already sets `-Djava.net.preferIPv4Stack=true` in `engine/gradle.properties`; for the wrapper download itself run `GRADLE_OPTS="-Djava.net.preferIPv4Stack=true" ./gradlew --version` once. |
| `Unsupported class file major version` / Gradle refuses the JDK | The engine needs JDK 17 or newer on `PATH`/`JAVA_HOME`. Run `scripts/dev-check`. |
| Benchmark fails with *Another JMH instance might be running* | JMH allows one run per machine. Wait for the other benchmark (CLI or server) to finish. If none is running, delete the stale `jmh.lock` in the system temp directory. |
| Benchmarks take far longer than estimated | Spin locks with more threads than CPUs can crawl; reduce the thread counts, or forks and iterations. |
| Correctness check reports `TIMEOUT` | Possible deadlock or livelock, or an overloaded machine. Rerun with the reported seed and fewer threads; check `diagnostics` in the report. |
| Stress tests are flaky on a busy machine | Close heavy programs; the test tier is sized for a laptop. Timeouts are generous (120 s per check). |
| Dashboard says *Engine offline* though the server runs | Check the address in Settings (default `http://127.0.0.1:8787`); make sure the dashboard's origin is allowed (`--allowed-origins`); a 403 in the server response means the origin is not allowed. |
| Engine responds 421 | The request's `Host` header was not `localhost`/`127.0.0.1`. Use one of those addresses. |
| Import says *not a LockScope result file* | Only JSON written by the engine (`lockscope.benchmark/v1` or `lockscope.correctness/v1`) can be imported; CSV is an export format. |
| Imported results disappear | Browser storage is disabled, full or cleared (private windows clear it). Export what you want to keep. |
| `npm ci` fails | Use Node 20.19+ or 22+. Delete `node_modules` and retry. |
| Port 8787 in use | `./gradlew :server:run --args="--port 8790"`, then set `http://127.0.0.1:8790` in Settings. |
| `git` warns *Filename too long* (Windows) | The checkout path plus `node_modules` exceeds 260 characters. Clone to a short path such as `C:\src\lockscope`, or run `git config core.longpaths true`. |
| jcstress reports `[VM ERROR]` with *insufficient memory* or *Not enough memory resources* | The machine ran out of committed memory: jcstress runs many test JVMs at once. Close other programs or limit parallelism with `-Pjcstress.cpus=4` (or 2). These are infrastructure errors, not test failures, but the task still fails so they are not overlooked. |
