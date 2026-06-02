# Dependencies

Anti-dependency-injection under all circumstances. Import directly. If a dependency varies enough to need wiring, factor it differently.

## Rules

1. **No dependency injection in production code, full stop.** Not in route handlers, not in services, not in skill scripts. No class-based DI containers. No singleton register/get patterns. No closure factories that take dependencies as parameters. Every dependency is a direct import at the top of the file.

2. **Default behaviour built-in, not injected.** When a capability is always needed, don't make consumers pass it in. A constructor that requires `{ wakeFn: wakeAgentForOpportunity }` from every caller is a sign that the class should just import `wakeAgentForOpportunity` itself. "Configurability" that nobody configures is dead weight.

3. **Module-level state for runtime caches.** Inflight maps, memoization caches, debouncers — define them as `const` at module scope inside the file that uses them, not as fields on an injectable service.

4. **Singletons are imported, not registered.** If something is a singleton (`assistantEventHub`, `appLogger`), it exports an instance. Consumers import that instance. No `register(eventHub)` step at startup.

5. **Prefer file-based auto-registration over manual wiring.** Route files in a `routes/` directory beat a `const ROUTES = [...]` array somewhere else. Let the directory be the registry — the class discovers its capabilities from the filesystem.

6. **No unnecessary wrappers or indirection.** Don't wrap an import in a helper function unless there's a real reason: circular dependency, conditional loading, ESM/CJS interop. A `runCmd` that just calls `runAssistantCommandFull` obscures what the test is doing for zero value.

7. **Read code by reading imports.** You should be able to answer "where does this come from?" by reading the top of the file. If the answer requires hunting through a registration call somewhere else, the indirection is hurting more than it's helping.

## Why

DI sells "testability" and "flexibility" but the cost is everywhere: every call site negotiates the dep, every test rebuilds a fake graph, every reader has to trace the wiring. Anti-DI flips it: production code is direct, tests mock at the I/O boundary (see `unit-testing.md`), and the import statement is the documentation.
