LockScope as an installable desktop app: it starts the engine, serves the dashboard from it and
opens it in your browser, so new correctness checks and JMH benchmarks run on your computer with
no setup.

| System | Download | Java needed? |
|---|---|---|
| Windows 10/11 (x64) | `...-windows-x64.msi`, or `...-windows-x64-portable.zip` | No, bundled |
| Ubuntu, Debian, Mint (x64) | `...-linux-amd64.deb` | No, bundled |
| Fedora, RHEL, openSUSE (x64) | `...-linux-x86_64.rpm` | No, bundled |
| Linux, no install (x64) | `...-linux-x64.tar.gz` | No, bundled |
| macOS (Apple silicon) | `...-macos-arm64.dmg` | No, bundled |
| Anything else (Intel Mac, ARM Linux, ...) | `...-universal.zip` | Java 17+ |

The packages are not code-signed. Windows SmartScreen: *More info → Run anyway*. Windows Smart
App Control: run `Start LockScope.bat` in the install folder. macOS: *System Settings → Privacy &
Security → Open Anyway*. Details: [docs/installing.md](https://github.com/gthanishqreddy-hue/lockscope/blob/main/docs/installing.md).

Every package was installed and smoke-tested on its own system by the release workflow: dashboard,
API and a forked JMH benchmark with the bundled runtime. Checksums: `SHA256SUMS.txt`.
