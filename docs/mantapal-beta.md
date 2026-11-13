# Mantapal Cloud — quick beta

This is a **desktop-only** beta account and service-connection feature. It does not alter Sub2API or the existing ACP/Agent runtime, and does not bind any Agent automatically.

## Implementation

- Settings → **Mantapal Cloud** (visible only in the local desktop runtime)
- Enter the Sub2API **website root** (HTTPS), email and password; optional six-digit TOTP login
- Account access/refresh tokens stored via existing OS keyring `keyring_store`, not browser localStorage
- Retrieve `/api/v1/user/profile`, usage dashboard statistics, active subscriptions, and available groups
- Open the existing site's `/purchase` and `/usage` in the default browser; website sign-in is separate
- Create a user-owned API Key via `/api/v1/keys`, then create an independent Model Provider for Claude Code, Codex, or Gemini CLI
- Open Agent Settings and bind the newly imported Provider manually to switch from BYOK

## Known beta limitations

1. CAPTCHA-enabled Sub2API login requires website login; this beta does not yet collect Turnstile/Tencent challenge proofs. TOTP 2FA is supported.
2. No automatic gateway API Key revocation on panel logout: an imported Key remains valid until the user revokes it in the Sub2API console. The UI warns about this.
3. The existing Provider storage writes API keys into local SQLite and, for some agents, native configuration. This is inherited behavior, not a hardened credentials design.
4. The gateway's protocol/group/model combination must be compatible with the selected Agent. This beta only creates the configuration and does not assert tool-call compatibility.
5. The website payment page is reused; desktop login is not automatically federated to the browser.
6. There is no custom commercial entitlement, device-binding, updater rebranding, or new installer in this beta.
7. Only local desktop mode is enabled; browser/server and remote desktop modes are intentionally not connected.

## Manual smoke test

1. Open Settings → Mantapal Cloud on a local Tauri desktop build.
2. Sign in using a Sub2API instance with CAPTCHA disabled. Verify two-factor prompt if applicable.
3. Check that balance, real billed usage, and groups load. Reopen the app and verify the account session resumes.
4. Test expired access-token refresh and a revoked refresh token.
5. Select one supported group and import a Provider. Confirm it is unbound and original Agent credentials are unchanged.
6. In Settings → Agents explicitly bind the new Provider; run a model/tool-call task using a compatible gateway.
7. Open `/purchase` and `/usage` in the browser; check that a completed payment updates the balance on refresh and real requests appear in the gateway's usage logs.
8. Log out. Check that the account UI is signed out while the already-issued model Key is **still active** (documented behavior).
9. Check invalid gateway URL, invalid credentials, HTTP 401, HTTP 5xx, slow network, no available groups, and failed Provider creation.

## Build / validation status

This branch was submitted from the GitHub connector; it has **not** been built or tested on Windows, and is not a distributable installer. Review CI results and perform a local desktop smoke test before inviting paid users.
