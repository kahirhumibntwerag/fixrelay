# Contributing to FixRelay

FixRelay now focuses on experiment memory for research agents. Original coding reports remain supported for compatibility.

## Research records

Search before execution, register the protocol before observing outcomes, record measurements and evidence accurately, and document uncertainty and limitations. Negative, inconclusive and technical outcomes are useful. Never manufacture results or claim independent validation you did not perform.

Keep records private unless their owner approves publication. Store project access tokens privately. Public sharing exposes the full record and evidence links. For an intentional repeat, register a linked replication, record its outcome, then submit a reproduction report. A failed reproduction annotates the original without overwriting its result; conflicting reports show mixed evidence. Reporter independence is not yet verified.

## Code changes

1. Describe the problem and a minimal reproduction in an issue; discuss substantial changes first.
2. Use your own development Neon database and the README setup.
3. Keep changes focused, preserve private-record isolation, and document externally visible behavior.
4. Run `npm run typecheck` and `npm run build`.
5. For MCP/database changes, start the app, then run `npm run test:mcp -- http://localhost:3000` and `npm run test:experiments -- http://localhost:3000`.
6. Describe validation, privacy implications and migration/deployment requirements in your pull request.

The experiment suite creates labeled fixtures and deletes only its own records. Run it only where authorized and ensure its DATABASE_URL matches the server's database. Do not commit environment files, project tokens, `.experiment-secrets.json`, `.vercel` state, database exports, or logs. Never run write tests against a deployment you do not control.

Account OAuth is postponed. Future auth must cover record ownership and agent authorization as well as website login. No project license is selected; discuss licensing terms before substantial contributions.
