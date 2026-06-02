# Naming

Name things by what they are, not by the subsystem that first needed them.

## Rules

1. **Name env vars after the resource they control, not the subsystem that introduced them.** When multiple resources share a shape (IPC socket dirs, DB pool sizes), each gets its own env var. Don't share `GATEWAY_X` across `gateway.sock` and `assistant.sock` just because the implementations look alike.

2. **Validators return domain objects, not booleans.** When a validator's output feeds a domain operation, return the domain fields (`{channel, externalUserId, deliveryChatId, displayName}`) — not just `true` / `false`. Keeps provider-specific knowledge in the validator and the caller generic.

3. **Preserve diagnostic metadata in return types.** Don't flatten a structured return (e.g. `IpcSocketPathResolution` → `string`) without checking whether the metadata drives logging or alerting. If `source: "env" | "default" | "fallback"` powers a warning that detects degraded configs, removing it silences the warning forever.

4. **Name after the noun, not the verb.** `EmailValidator` over `ValidateEmail`. The thing is the validator; what it does is implicit in its type.
