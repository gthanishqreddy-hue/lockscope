LockScope - universal package
=============================

Runs on Windows, Linux and macOS (Intel and Apple silicon). Needs Java 17 or newer
(for example from https://adoptium.net). Check with:  java -version

Start the desktop app (engine + dashboard in your browser):
  Windows:        double-click bin\lockscope-app.bat
  Linux / macOS:  ./bin/lockscope-app

It opens http://127.0.0.1:8787/ in your browser and shows a small window;
closing that window stops LockScope. On a machine without a display it prints
the address instead and runs until you press Ctrl+C.

Command-line tool (stress tests, benchmarks):
  bin/lockscope stress --target locks
  bin/lockscope bench --profile lock-high-contention --threads 1,2,4
  bin/lockscope --help

Everything runs on this computer only; the engine listens on 127.0.0.1 and
never accepts connections from the network.

Documentation: https://github.com/gthanishqreddy-hue/lockscope
