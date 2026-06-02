# Identity Data

Sensitive identity data must flow from trusted sources, never from LLM context. Design the flow so the LLM never has the opportunity to inject fabricated identity claims.

## Rules

1. **Identity data flows only from trusted sources.** Platform database, authenticated APIs, signed tokens. Never the LLM's conversational context, never CLI params the assistant could fabricate, never arguments parsed out of free-form chat.

2. **The trusted source is the only path into the function.** If a CLI param exists for identity, it must be a *key into* the trusted source (e.g. user ID → DB lookup), not the identity value itself. An email or phone number passed in directly is a prompt-injection attack surface.

3. **Design as if the assistant is already prompt-injected.** Assume the LLM is compromised. Every identity claim it could pass to a downstream call is a potential privilege escalation. The defense lives in the data flow, not in the prompt.

4. **Identity writes never originate from the assistant.** Contacts, guardian bindings, trust graph mutations — these come from the gateway via authenticated routes. The assistant has no IPC or HTTP path that creates or modifies identity records.

## Why

The LLM can hallucinate or be manipulated into making up identity claims. If the data flow accepts an email from the LLM, a prompt injection becomes a privilege escalation. See `logging.md` for the parallel concern: keeping identity data out of logs even when it's legitimately in the request.
