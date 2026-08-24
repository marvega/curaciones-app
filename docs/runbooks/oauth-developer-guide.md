# OAuth 2.0 Developer Guide

This guide explains how to integrate with the `curaciones` OAuth 2.0 Authorization Server.

**Issuer:** configured via `OAUTH_ISSUER` env var (default `http://localhost:3000`)

---

## 1. Endpoints

| Method | Path | Auth required | Description |
|---|---|---|---|
| `GET` | `/.well-known/openid-configuration` | None | OIDC/OAuth discovery document (RFC 8414) |
| `GET` | `/.well-known/oauth-authorization-server` | None | Alias for discovery doc |
| `GET` | `/jwks.json` | None | Public signing keys (RS256) |
| `POST` | `/oauth/register` | None | Dynamic Client Registration (RFC 7591) |
| `GET/POST` | `/oauth/register/:client_id` | Registration AT | Registration management (read/update/delete) |
| `GET` | `/oauth/authorize` | None (user session for consent) | Authorization endpoint — start OAuth flow |
| `POST` | `/oauth/token` | None (client credentials in body) | Token exchange and refresh |
| `POST` | `/oauth/revoke` | None (client credentials in body) | Token revocation (RFC 7009) |
| `GET` | `/oauth/userinfo` | Bearer AT | UserInfo endpoint (OIDC) |
| `GET` | `/oauth/consent/:uid` | Internal JWT (session user) | Consent screen metadata |
| `POST` | `/oauth/consent/:uid` | Internal JWT (session user) | Submit consent decision |
| `GET` | `/api/account/connected-apps` | Internal JWT | List active grants for the user |
| `DELETE` | `/api/account/connected-apps/:grantId` | Internal JWT | Revoke a grant |

---

## 2. Scopes

| Scope | Label | What it grants |
|---|---|---|
| `openid` | — | ID token with `sub`, `username`, `org_id`, `org_name`, `role` |
| `offline_access` | — | Refresh token (requires `prompt=consent`) |
| `patients:read` | Leer pacientes | Search and read patients and their history |
| `patients:write` | Editar pacientes | Create and modify patients (implies `patients:read`) |
| `clinical:read` | Leer datos clínicos | Read wound records, notes, and cycles |
| `clinical:write` | Editar fichas clínicas | Create and edit wound records and notes (implies `clinical:read`) |
| `agenda:read` | Leer agenda | Read appointments and availability |
| `agenda:write` | Editar agenda | Create, update, and cancel appointments (implies `agenda:read`) |
| `inventory:read` | Leer inventario | Read products, batches, and counts |
| `inventory:write` | Editar inventario | Modify stock and record counts (implies `inventory:read`) |
| `reports:read` | Leer reportes | Generate and export reports |
| `org:admin` | Administrar organización | Manage members, roles, and invitations |

**Implicit scope elevation:** `*:write` satisfies the corresponding `*:read` check. You do not need to request both.

---

## 3. Access token format

Access tokens are **signed JWTs (RS256)** when the request includes at least one domain scope (any scope except `openid` / `offline_access`). They carry these claims:

| Claim | Type | Description |
|---|---|---|
| `iss` | string | Issuer — value of `OAUTH_ISSUER` |
| `sub` | string | User ID |
| `aud` | string | Resource server audience — same as `iss` |
| `exp` | number | Expiry (Unix timestamp) — **10 minutes** from issue |
| `iat` | number | Issued at (Unix timestamp) |
| `jti` | string | Unique token ID |
| `scope` | string | Space-separated domain scopes granted |
| `client_id` | string | Client that requested the token |
| `org_id` | string | Organization the user authorized access for |
| `role` | string | User's role within that organization |

---

## 4. Complete curl flow: DCR → authorize → token → call

### Step 1: Register your client (DCR)

```bash
ISSUER="http://localhost:3000"

CLIENT=$(curl -s -X POST "$ISSUER/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My Integration",
    "redirect_uris": ["https://myapp.example.com/oauth/callback"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none",
    "application_type": "web",
    "scope": "openid offline_access patients:read clinical:read"
  }')

CLIENT_ID=$(echo $CLIENT | jq -r .client_id)
echo "Client ID: $CLIENT_ID"
```

**Notes:**
- Use `token_endpoint_auth_method: "none"` for public clients (SPAs, mobile apps) — no client secret needed.
- `redirect_uris` must be HTTPS or `http://localhost` / `http://127.0.0.1` / `http://[::1]`.
- No fragment (`#`) allowed in redirect URIs.

### Step 2: Generate PKCE pair

```bash
CODE_VERIFIER=$(openssl rand -base64 48 | tr '+/=' '-_' | tr -d '\n' | head -c 64)
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '+/=' '-_' | tr -d '=\n')
STATE=$(openssl rand -hex 8)
```

### Step 3: Build the authorization URL

Open this URL in a browser (or redirect the user to it):

```
$ISSUER/oauth/authorize?
  client_id=$CLIENT_ID
  &redirect_uri=https://myapp.example.com/oauth/callback
  &response_type=code
  &scope=openid%20offline_access%20patients:read%20clinical:read
  &state=$STATE
  &code_challenge=$CODE_CHALLENGE
  &code_challenge_method=S256
  &prompt=consent
```

The user will see a consent screen listing the requested scopes and must select an organization. On approval, they are redirected to:

```
https://myapp.example.com/oauth/callback?code=<AUTH_CODE>&state=$STATE
```

**Always verify `state` matches your original value before exchanging the code.**

### Step 4: Exchange code for tokens

```bash
TOKEN_RESPONSE=$(curl -s -X POST "$ISSUER/oauth/token" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=$CODE" \
  --data-urlencode "redirect_uri=https://myapp.example.com/oauth/callback" \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "code_verifier=$CODE_VERIFIER")

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r .access_token)
REFRESH_TOKEN=$(echo $TOKEN_RESPONSE | jq -r .refresh_token)
echo "AT expires in: $(echo $TOKEN_RESPONSE | jq .expires_in)s"
```

### Step 5: Call a protected endpoint

```bash
curl -s "http://localhost:3000/api/patients" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Step 6: Refresh the access token

```bash
NEW_TOKENS=$(curl -s -X POST "$ISSUER/oauth/token" \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "refresh_token=$REFRESH_TOKEN" \
  --data-urlencode "client_id=$CLIENT_ID")

ACCESS_TOKEN=$(echo $NEW_TOKENS | jq -r .access_token)
REFRESH_TOKEN=$(echo $NEW_TOKENS | jq -r .refresh_token)  # rotation: store new RT
```

**Refresh tokens rotate on every use.** Always store the latest refresh token returned. The old one is immediately invalidated.

### Step 7: Revoke when done

```bash
curl -s -X POST "$ISSUER/oauth/revoke" \
  --data-urlencode "token=$ACCESS_TOKEN" \
  --data-urlencode "client_id=$CLIENT_ID"
```

---

## 5. Common errors

| Error | HTTP | Meaning | Fix |
|---|---|---|---|
| `insufficient_scope` | 403 | AT does not have the required scope | Re-authorize with the missing scope included |
| `invalid_grant` | 400 | Auth code expired/used, or refresh token revoked | Restart the authorize flow |
| `invalid_request` | 400 | Missing required parameter or invalid PKCE | Check the request parameters |
| `invalid_client` | 401 | client_id not found or auth method mismatch | Verify your client_id from DCR |
| `unsupported_grant_type` | 400 | grant_type not supported | Use `authorization_code` or `refresh_token` |
| `access_denied` | 400 | User rejected the consent screen | Ask the user to authorize again |

**Error response shape** (RFC 6749 §5.2):
```json
{ "error": "invalid_grant", "error_description": "grant request is invalid" }
```

---

## 6. Troubleshooting

**My token expired**
AT TTL is **10 minutes**. Use your refresh token to get a new AT (see Step 6 above). If the refresh token is also expired (TTL: **30 days**), restart the authorization flow.

**I lost my refresh token**
You cannot recover it. Start a new authorization flow. The user will see the consent screen again (since you pass `prompt=consent`).

**How do I revoke a grant?**
Users can revoke grants from their account at `/account/connected-apps` (SPA) or via `DELETE /api/account/connected-apps/:grantId` with their session JWT. Programmatically, call `POST /oauth/revoke` with the access or refresh token.

**How do I change which organization the token is scoped to?**
Re-authorize. During the consent flow, the user selects an organization. The `org_id` claim in the AT reflects that choice. Each AT is scoped to exactly one organization.

**Userinfo returns 401 after revocation**
Expected. Revocation immediately marks the JTI in the `oauth_revocation` denylist. The `OAuthJwtStrategy` checks this denylist on every request.

**My AT has no `org_id` claim**
Your grant may not have been linked to an organization. Check `oauth_grant.organizationId` in the DB. This happens if the `extraTokenClaims` hook could not resolve the grant (e.g., grant not found or membership inactive).

---

## 7. Rate limits

| Endpoint | Limit | Window |
|---|---|---|
| `POST /oauth/register` | 10 requests | per hour per IP |
| `POST /oauth/token` | 60 requests | per minute per client_id |
| `POST /oauth/revoke` | 60 requests | per minute per client_id |
| `GET /oauth/userinfo` | 120 requests | per minute per client_id |

Throttled requests return HTTP 429. Retry after the `Retry-After` header value (seconds).

Per-client tracking is based on the `client_id` claim in the bearer token (RFC 9068 §2.2). SPA session tokens (no `client_id` claim) are tracked by IP.

---

## 8. What is out of scope (v1)

| Feature | Status |
|---|---|
| Client credentials grant | Not supported — use authorization_code only |
| Device authorization grant | Not supported |
| JWT Bearer grant (RFC 7523) | Not supported |
| Token introspection endpoint | Not enabled |
| Dynamic scope negotiation | Not supported — scope set at authorize time |
| Multiple resource servers | Not supported — single resource server (issuer) |
| Client authentication via private_key_jwt | Not supported |
| Pushed Authorization Requests (PAR) | Not supported |
| Organization-switching without re-authorization | Not supported — one org per grant |
