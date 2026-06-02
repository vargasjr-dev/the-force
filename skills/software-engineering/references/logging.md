# Logging

No PII. No auth objects. No reserved LogRecord field names.

## Rules

1. **No PII in logs.** No emails, phone numbers, raw user IDs, or other personal data in structured fields. Log operation context (provider type, success/failure, hashed correlation ID) without the sensitive payload. If you need to correlate across log lines, use a trace ID or a hash — never the raw value.

2. **Never log an auth object directly.** Auth objects carry bearer tokens, session tokens, refresh tokens. The whole object leaks credentials into log aggregation systems.
   ```ts
   // Good — log field names without values
   logger.info("auth received", { keys: Object.keys(auth ?? {}) });

   // Never
   logger.info("auth received", { auth });
   ```

3. **No reserved Python `LogRecord` names in `extra={}`.** `logger.info(..., extra={})` rejects (or silently shadows) keys that collide with `LogRecord` built-ins: `name`, `msg`, `args`, `levelname`, `pathname`, `module`, `funcName`, `created`, `process`, `thread`. Prefix your fields when in doubt: `extra={"event_name": "..."}` not `extra={"name": "..."}`.

4. **Log decisions and outcomes, not arguments.** A useful log line tells the reader what the code *decided* (route chosen, fallback taken, code path entered). Dumping the input arguments alone leaves the reader to re-derive the decision themselves.
