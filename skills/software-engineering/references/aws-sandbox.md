# AWS sandbox

The assistant has SSH credentials to its own AWS sandbox — a Mac mini EC2
instance reserved for end-to-end QA work (running evals against a fresh
assistant install, reproducing prod-only bugs, anything Docker-real).

## Connection

```bash
ssh ec2-user@72.44.51.27
```

- Key: `/workspace/.ssh/id_ed25519` (pub fingerprint
  `SHA256:jUW697Yd3yRM4svTwGe7aSF7OgDiaQnVjldeX0Qs9Zw`).
- **Gotcha**: SSH defaults to `~/.ssh/id_ed25519`, which for root is
  `/root/.ssh/`. The key only lives under `/workspace/.ssh/`, so a
  default-config ssh falls through to `Permission denied (publickey)`.
  Fix once per container: `ln -s /workspace/.ssh/id_ed25519
  /root/.ssh/id_ed25519` (and the `.pub`). Or use `-i` every time.
  Both keys are root-owned with 600/644 perms.
- Public key is provisioned via the GCP secret
  `ASSISTANT_SANDBOX_AUTHORIZED_SSH_KEYS` (see
  `memory/concepts/objects/assistant-sandbox.md` for the bootstrap
  history). The May-13 NAT-secret blocker is resolved.

## Shape

The box is a **Mac mini (Darwin arm64, macOS Sequoia 15.x)**, not a
Linux EC2 node. Implications:

- No Docker by default. Anything in `evals` that depends on the
  Dockerized hatch path needs Docker Desktop or Colima installed
  first. The in-process / simulator adapter paths (what the V2 unit
  tests already exercise) work without it.
- No bun, no node. First-time bootstrap: install bun from
  `https://bun.sh/install`, install Node only if a tool needs it.
- Apple git is preinstalled. Use `gh` (GitHub CLI) or a fresh `git
  clone` with a short-lived install token from `hq auth` to fetch
  `vellum-assistant`.
- `/Users/ec2-user` is the home dir. Plenty of disk
  (~154 GB free on the data volume).

## When to use it

Reach for the sandbox when a task asks for **real end-to-end signal**
that can't be faked locally:

- Running an evals benchmark against a freshly hatched assistant
  instance to validate hatching, setup, and event-stream wiring at
  scale.
- Smoke-probing a new artifact format on top of a real run.
- Reproducing a production-only issue (network/egress, real model
  providers, real Docker daemon).

Do **not** use the sandbox for:

- Anything that fits in a unit test or the `evals run` simulator
  in-process.
- Anything you can hatch locally in `/workspace` with a fake adapter.
- Burning credits to "see what happens" — always pick the smallest
  probe that proves the hypothesis.

## Default smoke-probe shape (~$few)

1. Bootstrap once: install bun, clone `vellum-assistant`, `bun install`
   at repo root + `evals/`.
2. Run 5 V2 items against one profile via the simulator path. Goal is
   "harness works end-to-end on the sandbox; artifacts land; report
   renders." Should complete in under 10 minutes and cost low single
   digits of USD.
3. `scp -r` the resulting `evals/runs/` directory back to
   `/workspace/repos/vellum-assistant/evals/runs/` so the run-detail
   report can be served from the local report-server.

## Hand-off

After every sandbox session:

- Copy the resulting `runs/` directory back to `/workspace` — that's
  the artifact Vargas cares about, not raw stdout.
- Update this file with anything new you learned (toolchain versions,
  teardown gotchas, missing perms).
- Don't `shutdown` the box without confirming with Vargas — it costs
  almost nothing idle and rebooting eats provisioning time.
