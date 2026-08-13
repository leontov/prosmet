# Xiaomi MiMo HTTP 404 — root cause

Live production diagnostics showed that the stored MiMo connection used:

```text
type: http-agent
baseUrl: https://token-plan-sgp.xiaomimimo.com/v1
model: null
```

The generic HTTP-agent adapter posts directly to the configured URL. Xiaomi MiMo Token Plan exposes an OpenAI-compatible endpoint at:

```text
POST https://token-plan-sgp.xiaomimimo.com/v1/chat/completions
```

Therefore the request never reached model authentication and OpenResty returned HTTP 404. The API key was not the cause.

The accepted configuration is:

```text
type: openai-compatible
baseUrl: https://token-plan-sgp.xiaomimimo.com/v1
model: mimo-v2.5-pro
```

The stored encrypted key must be preserved during migration. The product must prevent Xiaomi MiMo API hosts from being saved as a generic HTTP agent.
