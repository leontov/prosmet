# Local LLM and official free-tier provider policy

## Production objective

ProSmet must remain usable when a paid upstream model is unavailable. The production control plane therefore has two independent sources of inference:

1. a loopback-only Ollama runtime on `prosmet-primary`;
2. optional official provider accounts that expose a free tier and are configured with credentials owned by the repository owner.

The local runtime is not exposed through Caddy, Nginx or a public network interface. Only the ProSmet server on the same host may call `http://127.0.0.1:11434`.

## Local model

Default model: `qwen3.5:9b`.

The model identifier is configurable with the repository variable `PROSMET_LOCAL_LLM_MODEL` or the `model` input of the provisioning workflow. The default is intentionally small enough for a general-purpose production node while retaining multilingual, tool-use and structured-output capability. A larger model must be selected only after checking the actual RAM, VRAM, context requirement and measured latency on Primary.

`deployment/provision-local-llm.sh` performs the following fail-closed sequence:

1. validates that the endpoint is loopback-only;
2. installs Ollama from its official HTTPS installer when it is absent and passwordless `sudo` is available;
3. starts the existing system service or a detached user process without `RUNNER_TRACKING_ID`;
4. rejects wildcard network exposure;
5. pulls the configured model when it is absent;
6. performs a real `/api/chat` structured-JSON smoke test;
7. writes non-secret evidence to `$HOME/.prosmet-greenfield/local-llm.json`.

## Connection to ProSmet

`scripts/provision-agent-pool.mjs` uses the existing admin API. It never edits `agents.json` directly and never bypasses server-side AES-256-GCM secret storage.

The script creates or updates the local connection as:

```text
type: ollama
baseUrl: http://127.0.0.1:11434
model: qwen3.5:9b (or configured override)
```

It then calls the same `/api/agents/{id}/test` route used by the settings UI. The workflow fails when the local model cannot pass that adapter test.

Activation policy:

- `auto` — preserve a healthy active cloud agent; activate local Ollama when no active agent exists or the active agent fails its health check;
- `always` — make local Ollama active after provisioning;
- `never` — register and test Ollama without changing the current active agent.

The policy is controlled by `PROSMET_LOCAL_LLM_ACTIVATE` or the workflow-dispatch `activation` input.

## Legitimate free-tier providers

The workflow can register official free-tier accounts when the repository owner configures the corresponding GitHub Actions secret:

| Provider | Secret | Base URL | Default model |
|---|---|---|---|
| Qwen / DashScope | `PROSMET_QWEN_API_KEY` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Groq | `PROSMET_GROQ_API_KEY` | `https://api.groq.com/openai/v1` | `qwen/qwen3.6-27b` |
| Google Gemini | `PROSMET_GEMINI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| OpenRouter | `PROSMET_OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | `openrouter/free` |

Model overrides are available through `PROSMET_QWEN_MODEL`, `PROSMET_GROQ_MODEL`, `PROSMET_GEMINI_MODEL` and `PROSMET_OPENROUTER_MODEL` in the runner environment.

Free-tier quotas, model availability, data-use terms and geographic eligibility can change. Every connection is tested before it is recorded as available. An optional provider failure does not disable the verified local model.

## Secret boundary

The following sources are permitted:

- a key created in the owner's official provider account;
- a GitHub Actions secret configured by the repository owner;
- the encrypted secret form in ProSmet settings.

The following sources are prohibited:

- keys copied from public repositories, forums, paste sites or chat messages belonging to another person;
- shared key lists, scraped credentials or credentials with unknown ownership;
- committing any API key to source, workflow YAML, artifacts, screenshots or logs.

The provisioning evidence records provider identifiers, models, latency and success state only. It does not contain API keys.

## Fine-tuning gate

Installing a local model is not the same as producing a reliable estimator. Fine-tuning begins only after the baseline local model passes the same construction-estimate evaluation set as the active cloud model. Training data must be built from approved, de-identified estimate revisions and must preserve source, region, date, unit, tax mode and confidence metadata. No production estimate is used for training merely because it exists in the database.

The first production release therefore establishes the local runtime, structured-output contract and measurable baseline. LoRA or QLoRA training is a separate gated release with dataset review, holdout evaluation, rollback and license verification.

## Acceptance evidence

The workflow `Prosmet Local LLM Provisioning` is accepted only when all of the following are present:

- shell and Node syntax validation;
- exact trusted runner check (`prosmet-primary`);
- `local-llm.json` showing loopback-only exposure and a successful structured-output smoke test;
- `agent-pool-evidence.json` showing a successful ProSmet adapter test;
- production `/api/health` response;
- no credential-shaped value found in deployment or provisioning source.

<!-- operational trigger: local LLM provisioning requested on 2026-08-06 -->
