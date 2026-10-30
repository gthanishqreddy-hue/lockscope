# 2. Local API on the JDK HTTP server, not Spring Boot

**Status:** accepted

The API has eight endpoints, one client (the dashboard) and one user. Spring Boot would add about
20 MB of dependencies, slower start-up and a large attack surface for no functional gain.

**Decision:** use `com.sun.net.httpserver.HttpServer` (part of the JDK) with Jackson, bound to
loopback, with explicit CORS, Host-header and body-size checks.

**Consequences:** routing and validation are hand-written (`ApiHandler`, about 300 lines, covered by
`ApiServerTest`). No authentication is provided; the server must not be exposed to a network.
