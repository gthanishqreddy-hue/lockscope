# Installing the desktop app

The desktop app is the full LockScope on your own computer: it starts the engine, serves the
dashboard from it and opens it in your browser at `http://127.0.0.1:8787/`. New experiments then run
on your CPU, with no separate setup. A small window shows the address; **closing that window stops
LockScope**.

Download from the [latest release](https://github.com/gthanishqreddy-hue/lockscope/releases/latest).

| System | File | Java needed? |
|---|---|---|
| Windows 10/11 (x64) | `LockScope-<version>-windows-x64.msi` installer | No, bundled |
| Windows, no install | `LockScope-<version>-windows-x64-portable.zip` | No, bundled |
| Ubuntu, Debian, Mint (x64) | `LockScope-<version>-linux-amd64.deb` | No, bundled |
| Fedora, RHEL, openSUSE (x64) | `LockScope-<version>-linux-x86_64.rpm` | No, bundled |
| Linux, no install (x64) | `LockScope-<version>-linux-x64.tar.gz` | No, bundled |
| macOS (Apple silicon) | `LockScope-<version>-macos-arm64.dmg` | No, bundled |
| **Universal**: any of the above, Intel Macs, ARM Linux, ... | `LockScope-<version>-universal.zip` | Java 17 or newer |

`SHA256SUMS.txt` in the release lists the checksum of every file.

## Windows

1. Run the `.msi`. It installs for your user only (no administrator rights needed) and adds
   **LockScope** to the Start menu and the desktop.
2. Start **LockScope**. Your browser opens the dashboard.

Uninstall from *Settings → Apps → Installed apps → LockScope*.

**"Windows protected your PC" (SmartScreen):** the app is not code-signed (signing certificates cost
money). Choose *More info → Run anyway*.

**"Smart App Control blocked an app" / "An Application Control policy has blocked this file":**
Smart App Control blocks every unsigned program and has no *Run anyway* option. Open the install
folder (`%LOCALAPPDATA%\LockScope`, or the folder you chose) and double-click
**`Start LockScope.bat`**, which starts the same app with its bundled Java runtime. The portable zip
contains the same file. If that is blocked too, use the universal zip with an installed Java.

The installed folder also contains `lockscope-cli.exe`, the command-line tool (run it from a
terminal: `lockscope-cli.exe stress --target locks`).

## Linux

```bash
sudo apt install ./LockScope-<version>-linux-amd64.deb        # Debian, Ubuntu, Mint
sudo dnf install ./LockScope-<version>-linux-x86_64.rpm       # Fedora, RHEL
```

Start **LockScope** from the applications menu (category *Development*), or run
`/opt/lockscope/bin/LockScope`. The command-line tool is `/opt/lockscope/bin/lockscope-cli`.
Remove with `sudo apt remove lockscope` or `sudo dnf remove lockscope`.

Without installing: `tar xzf LockScope-<version>-linux-x64.tar.gz && LockScope/bin/LockScope`.

On a system without a desktop environment the package's menu entry cannot be registered and the
install stops with `No writable system menu directory found`. Run
`sudo mkdir -p /etc/xdg/menus /usr/share/applications /usr/share/desktop-directories` and install
again, or use the `.tar.gz`.

On a machine without a display (a server, WSL without GUI support), the app prints the address
and runs until Ctrl+C; open the address in a browser on the same machine.

## macOS

Open the `.dmg` and drag **LockScope** to *Applications*. The app is not signed or notarized by
Apple, so the first launch is blocked: open *System Settings → Privacy & Security*, scroll to the
message about LockScope and choose **Open Anyway**. Intel Macs: use the universal zip.

## Universal zip (any system with Java 17+)

Install Java 17 or newer (for example [Adoptium Temurin](https://adoptium.net)), unzip, then:

| | Desktop app | Command-line tool |
|---|---|---|
| Windows | double-click `bin\lockscope-app.bat` | `bin\lockscope.bat stress --target locks` |
| Linux, macOS | `./bin/lockscope-app` | `./bin/lockscope stress --target locks` |

## Ports, data and security

- The app uses port 8787. If something else already uses it, LockScope picks a free port and opens
  that instead. Starting LockScope a second time just reopens the dashboard of the running one.
- The engine listens on `127.0.0.1` only and answers only requests addressed to `localhost` or
  `127.0.0.1`; nothing is reachable from the network (see [SECURITY.md](../SECURITY.md)).
- Finished runs are kept by your browser for this address (`http://127.0.0.1:8787`), within its
  storage limit, together with your settings; the engine itself forgets them when you close the
  app. Export important results from *Results Explorer* (JSON or CSV) to keep a file. If LockScope
  had to use another port, that page is a different site to the browser and starts empty.

## Building the packages yourself

```bash
cd frontend && npm ci && npm run build:desktop && cd ..
cd engine
./gradlew :server:universalZip        # build/installers/LockScope-<version>-universal.zip
./gradlew :server:jpackageImage       # build/installers/LockScope/ (app folder for this OS)
./gradlew :server:jpackage            # installer for this OS: .msi (needs WiX 3), .deb or .dmg
./gradlew :server:jpackage -Pjpackage.type=rpm
```

`jpackage` (part of JDK 17+) can only build packages for the system it runs on, so the
[Installers workflow](../.github/workflows/installers.yml) builds each one on its own GitHub runner,
installs it, starts it, checks the dashboard and API and runs a forked benchmark with the bundled
runtime, then attaches everything to the release when a `v*` tag is pushed.

The bundled runtime keeps `bin/java` (jpackage normally strips it) because JMH starts every
benchmark in a fresh JVM. The icons come from `scripts/generate-icons.java`.
