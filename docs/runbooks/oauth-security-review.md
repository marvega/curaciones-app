# OAuth 2.0 Security Review Runbook

**Module:** `backend/src/oauth/`
**Standard:** RFC 6749, RFC 7636 (PKCE), RFC 7009 (revocation), RFC 8414 (server metadata), RFC 9068 (JWT AT)
**Pre-release gate:** All items in §3 must pass before promoting to `prd`.

---

## 1. Scope

This runbook covers the OAuth 2.0 Authorization Server in `curaciones`. It does **not** cover:
- Internal session JWT (`JWT_SECRET`) — see `backend/src/auth/`
- KMS key management — see `backend/src/kms/`
- MCP transport security — covered separately in Sub #3

---

## 2. OWASP + RFC Checklist

Each item lists: what to verify, how to test it, and the expected result.

### 2.1 redirect_uri exact match (no prefix bypass)

**Risk:** attacker registers `https://legitimate.example.com.attacker.com/cb` and steals auth codes.

```bash
# Register a client with a specific redirect_uri
CLIENT=$(curl -s -X POST http://localhost:3000/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"test","redirect_uris":["https://app.example.com/callback"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none","scope":"openid"}' \
  | jq -r .client_id)

# Attempt authorize with a prefix-extended URI — must be rejected
curl -v "http://localhost:3000/oauth/authorize?\
client_id=$CLIENT&redirect_uri=https://app.example.com/callback/evil\
&response_type=code&scope=openid&code_challenge=abc123&code_challenge_method=S256&prompt=consent"
```

**Expected:** 400 or redirect to an oidc-provider error page (not to the attacker URI). No `Location: https://app.example.com/callback/evil` header.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.2 state parameter propagated

**Risk:** CSRF on the callback — attacker can inject auth codes from their own authorization flow.

```bash
curl -v "http://localhost:3000/oauth/authorize?\
client_id=$CLIENT&redirect_uri=https://app.example.com/callback\
&response_type=code&scope=openid&state=CSRF_TOKEN_XYZ\
&code_challenge=<S256_challenge>&code_challenge_method=S256&prompt=consent"
# Follow redirect to consent, approve, then check final callback Location header
```

**Expected:** Final callback URL contains `state=CSRF_TOKEN_XYZ` unchanged.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.3 Authorization code single-use (no re-use)

**Risk:** leaked auth code can be exchanged multiple times.

```bash
# Exchange once (succeeds):
curl -s -X POST http://localhost:3000/oauth/token \
  -d "grant_type=authorization_code&code=$CODE&redirect_uri=...&client_id=$CLIENT&code_verifier=$VERIFIER"

# Exchange again (must fail):
curl -s -X POST http://localhost:3000/oauth/token \
  -d "grant_type=authorization_code&code=$CODE&redirect_uri=...&client_id=$CLIENT&code_verifier=$VERIFIER"
```

**Expected:** Second exchange returns `{"error":"invalid_grant"}`.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.4 PKCE S256 required — plain rejected

**Risk:** downgrade to plain PKCE makes PKCE trivial to bypass.

```bash
curl -v "http://localhost:3000/oauth/authorize?\
client_id=$CLIENT&redirect_uri=https://app.example.com/callback\
&response_type=code&scope=openid&code_challenge=abc123\
&code_challenge_method=plain&prompt=consent"
```

**Expected:** 400 or redirect with `error=invalid_request`. Never a 303 to the consent flow.

**Implementation check:** `oidc-provider.factory.ts` → `pkce: { required: () => true, methods: ['S256'] }`.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.5 JWT `aud` enforced

**Risk:** token intended for resource server A accepted by resource server B.

```bash
# Decode AT payload:
ACCESS_TOKEN="<token from /oauth/token>"
echo $ACCESS_TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

**Expected:** `aud` equals `OAUTH_ISSUER` (e.g., `http://localhost:3000`). The `OAuthJwtStrategy` validates `aud` via passport-jwt options.

**Implementation check:** `oauth-jwt.strategy.ts` → `audience: process.env.OAUTH_ISSUER`.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.6 DCR does not leak existence of other clients

**Risk:** timing or error messages reveal which client_ids exist.

```bash
# Attempt to read another client's registration (wrong RAT):
curl -v "http://localhost:3000/oauth/register/nonexistent-client-id" \
  -H "Authorization: Bearer wrong_token"
```

**Expected:** 401 or 404. Not a 403 that distinguishes "wrong token" from "client not found". oidc-provider returns 401 for all registration management auth failures.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.7 Refresh token rotation — reuse detection kills family

**Risk:** stolen refresh token can be reused if rotation reuse-detection is not enforced.

```bash
# Get refresh_token (scope must include offline_access):
RT="<refresh_token from token response>"

# Rotate once — get new RT1:
curl -s -X POST http://localhost:3000/oauth/token \
  -d "grant_type=refresh_token&refresh_token=$RT&client_id=$CLIENT"

# Attempt to reuse original RT — must fail and revoke RT1:
curl -s -X POST http://localhost:3000/oauth/token \
  -d "grant_type=refresh_token&refresh_token=$RT&client_id=$CLIENT"
```

**Expected:** Second call returns `{"error":"invalid_grant"}`. oidc-provider detects reuse and revokes the entire grant family.

**Implementation check:** `oidc-provider.factory.ts` → `rotateRefreshToken: true`. Reuse detection is built into oidc-provider.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.8 Rate limits block token endpoint spam

**Risk:** brute-force token requests.

```bash
# Send 61 requests to /oauth/token in <1 min — 61st must be throttled:
for i in $(seq 1 61); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/oauth/token \
    -d "grant_type=authorization_code&code=x&client_id=x&redirect_uri=x&code_verifier=x")
  echo "[$i] $STATUS"
done
```

**Expected:** Requests 1-60 return 400 (invalid_grant, not throttled). Request 61+ returns 429.

**Limits defined in:** `oauth-token.controller.ts` → `@Throttle({ default: { ttl: 60_000, limit: 60 } })`.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.9 Tokens do not appear in logs or audit payloads

**Risk:** access tokens leaked via log aggregation or audit DB.

```bash
# After completing an OAuth flow, search application logs:
grep -r "access_token\|refresh_token\|Bearer ey" /var/log/app/ 2>/dev/null
# or in stdout if running locally — check for token strings (ey...)
```

**Expected:** No token strings in logs. Audit log entries (`oauth.consent.granted`, `oauth.grant.revoked`, `oauth.client.registered`) contain metadata (client_id, org_id, user_id) but not token values.

**Implementation check:** `audit-log.interceptor.ts` → `/api/auth/login` in exclusion list. Consent and revocation audit events in respective services.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.10 DCR non-loopback HTTP redirect_uri rejected

**Risk:** HTTP (non-TLS) callbacks can be intercepted on the network.

```bash
curl -s -X POST http://localhost:3000/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"test","redirect_uris":["http://attacker.net/cb"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none","scope":"openid"}'
```

**Expected:** 400. `OAuthRegisterController.validateRedirectUri()` rejects non-loopback HTTP URIs before delegating to oidc-provider.

**Status:** ☐ Pass / ☐ Fail — Reviewed by: ________ Date: ________

---

### 2.11 Automated conformance runner

Run the standalone script against dev/staging before any `prd` merge:

```bash
cd backend
npm run oauth:conformance -- http://localhost:3000 --username test@example.com --password yourpassword
```

**Expected:** All 12 checks pass (exit code 0).

**Status:** ☐ Pass / ☐ Fail — Output attached: ________

---

## 3. Pre-release sign-off

All items in §2 must be checked before merging the OAuth feature to `prd`.

| Reviewer | Role | Date | Signature |
|---|---|---|---|
| | | | |
| | | | |

**Merge approved:** ☐ Yes — Notes: ________
