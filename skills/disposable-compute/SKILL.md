---
name: disposable-compute
description: >-
  Start and operate an isolated disposable repository worker through the
  configured compute broker. Use when implementation or validation is ready to
  begin, not while researching or writing a design.
metadata:
  emoji: "🛰️"
  vellum:
    display-name: "Disposable Compute"
    activation-hints:
      - "A repository task is ready for implementation or tests"
      - "A second independent repository task should run in parallel"
      - "The work requires Docker without touching the personal workspace"
    avoid-when:
      - "The user only wants research, source inspection, or a design"
      - "The task is specifically for Apple platform validation"
---

# Disposable Compute

Use a saved Force execution profile to request one isolated environment for one repository task. Force owns the logical profiles and broker protocol. An independently deployed broker owns infrastructure provisioning and cloud permissions.

## Dispatch boundary

Start a worker only when these values are known:

1. Repository in `owner/name` form.
2. Explicit base ref.
3. Task branch.
4. Concrete implementation, reproduction, build, test, or QA intent.

Do not start a worker to read an issue, inspect source for planning, or write a design document. Continue using the same worker while iterating on the same branch. A second independent task receives a second worker.

## Profiles

- `linux-dev`: default implementation and validation environment. It requires fresh home and temp directories and forbids mounting personal workspace state.
- `macos-qa`: gated Apple-specific validation lane. It requires one of the reasons declared in its saved profile.

Profiles describe capabilities and policy only. They do not include cloud account IDs, AMIs, instance types, launch templates, subnets, security groups, or IAM roles.

## Security boundary

The assistant must never receive general EC2 permissions. It calls the configured broker using the protocol under `src/disposable-compute/`. The broker maps a logical profile to infrastructure controlled by its deployer.

Do not put credentials, environment variables, API keys, cloud-init, or caller-selected infrastructure fields in a task request. Repository credentials must be delivered by a separate short-lived credential path once that integration exists.

## Lifecycle

The public lifecycle is:

```text
start -> status -> exec -> finish
```

- `start` is idempotent for the same caller-provided idempotency key.
- `status` returns the current task and hard expiry.
- `exec` accepts an argv array, optional relative working directory, and timeout. It does not accept caller-provided environment values.
- `finish` marks the task completed or abandoned and asks the broker to destroy the environment.

A hard broker-side TTL remains mandatory even if Force loses state or stops calling the API.


## Local command surface

From the Force plugin root:

```bash
bun run compute profiles
bun run compute plan --profile linux-dev --repo vellum-ai/vellum-assistant --base origin/main --branch apollo/example --idempotency-key conversation:task
bun run compute start --profile linux-dev --repo vellum-ai/vellum-assistant --base origin/main --branch apollo/example --idempotency-key conversation:task
bun run compute status task-000001
bun run compute exec task-000001 --cwd assistant --timeout 120 -- bun test
bun run compute finish task-000001 --outcome completed
```

`profiles` and `plan` are local and non-mutating. Broker commands require `FORCE_COMPUTE_BROKER_URL`. The optional `FORCE_COMPUTE_BROKER_TOKEN` is read from the process environment and sent as a bearer token. Resolve that value at execution time; never paste it into chat or place it in command arguments.
