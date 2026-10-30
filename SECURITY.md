# Security

## Threat model

LockScope is a local developer tool plus a static website.

- **Static dashboard:** no backend, no accounts, no analytics, no cookies, no third-party
  requests. It reads files the user chooses (validated against the schema, size-limited, never
  executed or rendered as HTML) and talks only to an engine at `127.0.0.1`/`localhost`. The
  `_headers` file sets a strict Content-Security-Policy (no inline scripts, `connect-src` limited
  to self and loopback), `frame-ancestors 'none'`, `nosniff` and `no-referrer`.
- **Local engine API:** binds to the loopback interface only; has **no authentication**; accepts
  only allow-listed CORS origins (403 otherwise) and only `Host` headers naming localhost (421
  otherwise, a DNS-rebinding defence); limits bodies to 64 KB; rejects unknown JSON fields; bounds
  threads, forks, iterations, runs, timeouts and total estimated time; runs one experiment at a time
  with a queue of 4; never executes commands or reads/writes arbitrary paths from requests; never
  returns stack traces to clients.

## Known limitations

- Any program running as your user on the same machine can call the local API. It can make the
  engine consume CPU for up to the configured limits; it cannot do anything else.
- **Do not expose the API to a network** (port forwarding, `0.0.0.0` proxies, tunnels). It is not
  designed for untrusted remote clients.
- CSV exports neutralize spreadsheet formulas, but open untrusted CSV files with care in general.
- Dependency audits: CI runs `npm audit --omit=dev --audit-level=high` for the dashboard. The Java
  dependencies are JMH, Jackson and JUnit; check them with your preferred SCA tool.

## Reporting

Please report vulnerabilities privately to the repository owner (GitHub: *Security* → *Report a
vulnerability*) rather than in a public issue.
