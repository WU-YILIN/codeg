# Mantapal Free — managed trial + optional BYOK

The **Free software tier** includes an integrated Mantapal model gateway and a configurable welcome trial balance. It does not ship a shared admin/upstream API key. The account API supplies a distinct user-owned gateway credential, created on demand and capped by server policy. The existing BYOK option remains available.

## Deploy order

1. Deploy and configure the backend branch in `WU-YILIN/sub2api-private` first.
2. Configure the per-login-source signup default balance in the Sub2API admin settings (e.g. `auth_source_default_email_balance` and the associated grant-on-signup option). The amount is operator-controlled, NOT hardcoded in the desktop application.
3. Configure backend trial group ID, default model, gateway endpoint and trial key quota for each supported agent.
4. Build the Mantapal client with the account-service origin.

## Desktop build

```powershell
$env:MANTAPAL_ACCOUNT_URL = "https://accounts.example.com"
pnpm tauri dev
```

Use the **account panel origin** here (same origin serves `/api/v1`). Do not use the model `/v1/responses` endpoint as the account URL. The backend returns the configured model gateway URL independently.

## Endpoints

`GET /api/v1/mantapal/membership`: versioned tier + feature entitlements; `managed_trial` is true only when a trial agent is configured.

`POST /api/v1/mantapal/free-connection` with body:

```json
{"agent_type":"codex"}
```

The backend authenticates the user, chooses the allowed group/model/endpoint, reuses or creates a per-user bounded API key, and returns that key only to the authenticated caller. It does **not** transfer new credits or refill an exhausted trial.

## Free experience

1. New user signs up and receives the signup gift configured in Sub2API.
2. User logs in to Mantapal. The account page displays Free and available wallet balance.
3. User chooses Codex, Claude Code or Gemini CLI and clicks **一键启用免费试用**.
4. Rust fetches the user's dedicated trial API key and creates a Model Provider, then binds it to the selected Agent.
5. Model calls go to the managed gateway and spend the authenticated user's wallet. Running Agent sessions may need restart to pick up new configuration.
6. Existing user-provided Providers remain intact. Binding to an already configured Agent requires an explicit opt-in.
7. BYOK is still offered as an alternative in normal Model Provider settings.

## Limitations

- This is an initial implementation; full Windows Tauri build, payment-free signup flow and live model/tool-call E2E have **not yet been verified**.
- Only Claude Code, Codex and Gemini CLI have the one-click managed-trial adapter. OpenCode remains available through its existing native BYOK configuration.
- The welcome grant uses the existing Sub2API user **wallet** and is not a separate trial-balance ledger. Paid/recharged amounts cannot currently be separated from signup grants in the desktop display.
- Existing accounts do not automatically get a new signup gift. A safe one-time backfill/claim system is needed if prior accounts should also receive trial credit.
- CAPTCHA-enabled password login needs an additional browser/device authorization flow.
- One trial key is tracked per user per agent. Cross-replica uniqueness relies on the new database partial index, which must be migration-tested before deployment.
- Do not use this as a signed distributable release without testing. The underlying Model Provider store still writes user-owned model keys into local SQLite/native Agent settings.
- Pro subscription and software payment flows are **not implemented**; the tier/entitlement contract remains extensible.

## Tests

```bash
pnpm test -- src/lib/mantapal-membership.test.ts
pnpm build
```

Then use `pnpm tauri dev` on Windows with the backend development branch; test registration grant, login/TOTP, issuing a trial key, repeated activation without extra keys, quota exhaustion, selecting another Agent, changing an existing Provider with explicit opt-in, BYOK recovery and session restart signals.
