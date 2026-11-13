# Mantapal Free membership integration

This branch introduces **software membership** separate from model API keys, balance and paid gateway subscriptions.
Only Free is active. Pro is a reserved tier identifier, not a purchasable plan.

## Contract

`GET /api/v1/mantapal/membership` requires the existing Sub2API user JWT.

```json
{"code":0,"message":"success","data":{"schema_version":1,"tier":"free","status":"active","entitlements":{"byok":true,"local_agents":true,"local_workspaces":true},"subscription":null,"upgrade_available":false}}
```

Every authenticated active account (including existing accounts) receives Free.
Gateway-credit subscriptions never change the Mantapal membership tier.

## Desktop build

Set the account website origin at **Rust compilation** (not the model inference URL):

```powershell
$env:MANTAPAL_ACCOUNT_URL = "https://accounts.example.com"
pnpm tauri dev
```

Without this setting the desktop shows a missing-account-server message and BYOK/local Agent features remain unaffected.
Remote origins require HTTPS; loopback HTTP is permitted only for local development.

## User flow

1. Open Settings -> Mantapal 账户.
2. Open the existing account site's registration page from 免费注册.
3. Sign in through the app; six-digit TOTP is supported.
4. Access/refresh tokens are held in the OS keyring, not browser localStorage.
5. The client loads /user/profile and /mantapal/membership; only a validated server response determines tier.
6. Existing Agent configuration, model keys, base URLs and local data remain untouched.
7. Logout revokes the refresh token if reachable and clears local account tokens, not BYOK settings.

## Future Pro extension

The response includes schema_version, tier, status, entitlements, subscription, upgrade_available.
Future releases can replace the static Free resolver with a per-user software-entitlement store.
Do not derive software Pro from Sub2API model-credit subscriptions. No paid flow or feature gate exists in this release.

## Limitations

- Native email/password login does not handle Turnstile/Tencent CAPTCHA proofs. A secure browser/device authorization flow is required if CAPTCHA is enforced.
- Account UI currently supports local desktop only, not Web or remote workspaces.
- No Pro pricing, paid subscriptions, checkout, renewal, billing or model-gateway key provisioning.
- No hardcoded production account URL; build deployment must supply MANTAPAL_ACCOUNT_URL.
- Previously closed Mantapal Cloud beta PR #1 is not part of this change.

## Verification

Backend:

```bash
cd backend
go test -tags unit ./internal/handler -run TestMantapalMembership -count=1
```

Frontend:

```bash
pnpm test -- src/lib/mantapal-membership.test.ts
pnpm build
```

Desktop smoke tests:
- New and existing accounts both return a server-confirmed Free membership.
- Session persists across app restart; expired access token refreshes safely.
- Revoked account cannot receive membership; missing membership endpoint does not invent Free/Pro.
- Logout does not modify BYOK Provider records, Agent settings, projects, or ACP/MCP sessions.
- No Pro purchase link or hidden paid feature restriction is introduced.

**Review status:** Changes are pushed, but Windows Tauri compilation, server deployment and actual API integration have not been run in this environment.
