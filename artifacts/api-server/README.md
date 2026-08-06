# NinjaOne Control Panel

A secure, self-hosted multi-tenant web app for NinjaOne RMM automation.
Manage multiple NinjaOne instances (tenants) and run user/device management
actions against whichever instance you select.

## Setup

### 1. Set required secrets

Set the following in **Replit Secrets** (or your `.env` file locally):

```
MASTER_KEY    — random 32+ char hex string (encrypts the credential vault)
SESSION_SECRET — random 32+ char hex string (signs session cookies)
```

Generate them with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Create the admin account

Run the setup script from the repo root:

```bash
node artifacts/api-server/setup/create-admin.mjs
```

This stores a bcrypt-hashed password in `data/admin-users.json`.

### 3. Start the server

The server starts via the configured Replit workflow. To run manually:

```bash
pnpm --filter @workspace/api-server run dev
```

Then open the app in your browser. You'll be redirected to `/login.html`.

## Security notes

The server validates at startup:

- `MASTER_KEY` must be present and ≥ 32 characters
- `SESSION_SECRET` must be present and ≥ 32 characters

### Vault encryption

Client secrets are encrypted at rest using **AES-256-GCM** with a key
derived from `MASTER_KEY` via **scrypt** (with a randomly generated salt
stored in `data/vault.salt`). `MASTER_KEY` itself is never written to disk.

When listing instances via the API, `clientSecret` is never returned.
`clientId` is shown partially masked (first 3 / last 3 characters).

### Session & CSRF

- Sessions use `express-session` with `httpOnly`, `sameSite: strict`, and
  `secure` in production (Replit serves over HTTPS).
- CSRF protection: a random token is generated at login, stored server-side in
  the session, and must be echoed by the frontend in the `X-CSRF-Token` header
  on every state-changing request. Missing or mismatched tokens are rejected
  with HTTP 403.
- Login endpoint is rate-limited to **10 attempts per 15 minutes per IP**.
- All `/api` routes are rate-limited to **120 requests per minute**.

## Known limitations

- **Single admin account model** — no per-user RBAC. All authenticated users
  share the same access level.
- **In-memory session store** — suitable for a single process. For
  multi-process deployments, replace with a Redis store (`connect-redis`).
- **Encrypted local vault** — `data/vault.enc.json` and `data/vault.salt` must
  be kept on persistent storage. This is reasonable for a small internal tool
  but is not a dedicated secrets manager. Consider migrating to HashiCorp Vault
  or a cloud KMS (Azure Key Vault, AWS Secrets Manager) for higher assurance.
- **No database** — all state is in local files. Back up the `data/` directory.

## API reference

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| GET | `/health` | ✗ | ✗ |
| POST | `/auth/login` | ✗ | ✗ |
| POST | `/auth/logout` | ✗ | ✗ |
| GET | `/auth/session` | ✗ | ✗ |
| GET | `/api/instances` | ✓ | ✗ |
| POST | `/api/instances` | ✓ | ✓ |
| PATCH | `/api/instances/:id` | ✓ | ✓ |
| DELETE | `/api/instances/:id` | ✓ | ✓ |
| POST | `/api/instances/:id/test` | ✓ | ✓ |
| GET | `/api/actions/:id/end-users/search?email=...` | ✓ | ✗ |
| POST | `/api/actions/:id/end-users` | ✓ | ✓ |
| POST | `/api/actions/:id/technicians` | ✓ | ✓ |
| GET | `/api/actions/:id/roles` | ✓ | ✗ |
| GET | `/api/actions/:id/devices/search?name=...` | ✓ | ✗ |
| GET | `/api/actions/:id/device-user-mapping[?format=csv]` | ✓ | ✗ |

## Audit log

Every meaningful action is appended as a JSON line to `data/audit.log`:

```json
{"timestamp":"…","username":"admin","action":"instance_added","instanceId":"…","name":"Contoso EU"}
```

Secrets, passwords, and access tokens are never logged.
