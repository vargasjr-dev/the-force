# Unit Testing

Aggressive about mocking I/O. Aggressive about NOT mocking our own code. Tests are executable documentation — fast, deterministic, and behaviour-focused.

## Rules

1. **Never mock our own source code.** If you feel the need to mock an internal module, the production code wants dependency parameters or a different shape — refactor the prod code, don't mock around it. An internal mock means the test is testing the mock, not the code.

2. **Mock external I/O aggressively.** Unit tests must be fast and deterministic. That means mocking everything at the boundary: HTTP, multi-process IPC, timers, filesystem when it's slow or environment-dependent. Use shared mock utilities (fetch helpers, etc.), not ad-hoc per-file mocks.

3. **Audit `mock.module` sites before changing a module's exports — add, remove, OR reshape.** Bun's `mock.module(...)` **fully replaces** the module's exports — it does not merge with the real ones. The two failure modes:
   - **Adding/removing an export:** consumers that import a symbol the mock didn't declare crash with `SyntaxError: Export named 'X' not found in module`.
   - **Changing the shape of an existing export's return / signature:** consumers destructure or call into the new shape, the mock still returns the old shape, and you get `TypeError: undefined is not an object (evaluating 'foo.bar')` at the consumer site. Lint and typecheck don't catch this because the mock is type-narrowed to the new declared signature (mocks are casts), and Bun loads the mock unchanged at test time.

   Run:
   ```bash
   bun run skills/software-engineering/scripts/mock-module-audit.ts <module-substring> --root <package>
   ```
   The script lists every test file that mocks the path and the symbols each currently stubs. Update every listed file when the public shape of the mocked symbol changes — not just the ones whose symbol the parser extracted by name.

4. **Never create production wrappers solely for testing.** If the test infra can't handle something, fix the test infra. Don't wrap `fetch()` with `myFetch()` just so a test can hook in.

5. **Given-When-Then in every test.** One logical assertion per test. Names self-diagnose on failure:
   - `should_<behavior>_when_<scenario>`
   - `<MethodUnderTest>_<Scenario>_<ExpectedResult>`

6. **No logic in tests.** Cyclomatic complexity 1 — no `if`, `switch`, loops, `try/catch`. Use `test.each` for parameterization.

7. **Test behaviour, not implementation.** Internal refactors that don't change behaviour should not break tests.

8. **Don't test private methods directly.** Either the public API already covers it, or the private logic wants its own class with a public interface.

9. **Narrow assertions.** Assert only what's relevant. Snapshotting whole objects when you care about one field makes tests brittle and noisy on failure.

10. **Tests follow production code standards.** Formatting, linting, review. Sloppy test code rots like sloppy production code.

11. **Each test < 100ms.** Slower means something's wrong with the setup.

12. **Deterministic by construction.** No real clocks (inject a clock or use fake timers), no real network (mock at the boundary), no real random (seed it), no `sleep`/`setTimeout`-based assertions (use fake timers, event-driven waiters, or direct async resolution).

13. **Order-independent.** Each test sets up its own state and cleans up after itself. Shared mutable state is the #1 source of flakiness.

14. **Cover edge cases, not just the happy path.** Boundaries (0, 1, max, max+1), empty inputs (`[]`, `{}`, `""`), nulls, off-by-one, error paths.

15. **Trust the test preload.** If preload sets `VELLUM_WORKSPACE_DIR`, makes temp dirs, resets the DB — don't redo that work in the test file. Build on what's there.

16. **Test files live in `__tests__/`**, not next to source.

17. **`bun test` from the package subdir, not repo root.** Running from root leaves `VELLUM_WORKSPACE_DIR=/workspace` set, and a `DELETE FROM contacts` in test setup hits the real DB. Three production data wipes from this: Apr 6 (credentials), Apr 11 + Apr 14 (contacts).

18. **Test the real code, not a reimplementation.** Import the real schema, the real handler, the real factory. If the real code is hard to import, that's a design signal — fix the real code.

## Lessons

- **PR #27459** — adding `resolveQdrantUrl` to `qdrant-client.ts` broke `graph-search.test.ts` because its `mock.module` call didn't declare the new export. 10 test files needed a one-line stub. The audit script exists so this is a 30-second check, not a CI surprise.

- **PR #32472** — changing `createSkillToolsFromManifest` from `Tool[]` to `{ tools, categories }` broke 4 test files. The mocks still returned `Tool[]`, so `projectSkillTools`'s `const { tools, categories } = createSkillToolsFromManifest(...)` destructured `tools = undefined` and crashed at `tools.length`. Typecheck didn't flag this because the mock factory's return type was declared as `Tool[]` (the cast IS the lie). The audit script lists every mock site for `skill-tool-factory` so the shape change is a fanout edit, not a CI surprise. Rule #3 extended to cover shape changes (not just add/remove of exports).

- **`vellum-adapter.test.ts` env leak (PR #32724, caught on AWS sandbox)** — the "hatches a fresh docker assistant…" test asserted `env: {}` on the spawned hatch call, but `VellumAgent`'s `processEnv` defaults to `process.env`. The leak source turned out to be subtler than a shell export: **Bun auto-loads `.env` files from the current working directory** (and parents) into `process.env` at startup. On the sandbox, `evals/.env` had `ANTHROPIC_API_KEY=…` for actually running the CLI — and that file was invisible to my `env | grep` diagnostic because shell exports and Bun's `.env` ingestion are separate channels. So `bun test` saw the key even though `env` didn't. **Rules of thumb**:
  1. When a test asserts on env-derived output, the test must inject the env explicitly. Production defaults to `process.env` for the right reasons — that's fine for prod, fatal for test determinism.
  2. Diagnosing a Bun-test env leak: don't just `env | grep`. Run `bun -e 'console.log(process.env.FOO)'` from the same cwd Bun would execute tests from. Bun's `.env` auto-loading respects the directory tree from `process.cwd()` upward.
  3. Greenlight gates that only run locally won't catch this. CI provider runs are reliable iff (a) no shell env vars match the test's domain AND (b) no `.env` file at or above the package dir contains them.
