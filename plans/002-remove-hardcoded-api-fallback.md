# Plan 002 — Remove Hardcoded API Fallback (App.tsx)

**Finding:** `App.tsx` has a hardcoded production fallback `https://api.pereira-pqrs.com` in `resolveApiBaseUrl()` that is not documented as a required environment variable. If `EXPO_PUBLIC_API_BASE_URL` is not set, the app silently uses this undocumented URL.
**Category:** Security / Config / Inconsistency
**Impact:** HIGH — production builds may hit wrong/unknown backend
**Effort:** S (Small)
**Risk:** LOW — config/logic change only
**Evidence:** `App.tsx:84-102` (function `resolveApiBaseUrl`)

---

## Current State

**`App.tsx` lines 84-102:**
```tsx
const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, '');

const resolveApiBaseUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configuredUrl) {
    return trimTrailingSlashes(configuredUrl);
  }

  if (__DEV__) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
  }

  return 'https://api.pereira-pqrs.com';  // <-- HARDCODED FALLBACK (line 100)
};

const API_BASE_URL = resolveApiBaseUrl();
```

**Usage locations in App.tsx:**
- Line ~470: `const healthResponse = await fetchWithTimeout(`${API_BASE_URL}/health`, ...)`
- Line ~505: `const response = await fetchWithTimeout(`${API_BASE_URL}/api/pqrs/submit-anonymous`, ...)`
- Line ~680: `const response = await fetchWithTimeout(`${API_BASE_URL}/api/pqrs/status/${encodeURIComponent(code)}`, ...)`

---

## Required Changes

### 1. Update `App.tsx` — `resolveApiBaseUrl` function

Replace the entire function (lines 84-102) with:

```tsx
const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, '');

const resolveApiBaseUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configuredUrl) {
    return trimTrailingSlashes(configuredUrl);
  }

  if (__DEV__) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
  }

  // PRODUCCIÓN: EXPO_PUBLIC_API_BASE_URL es OBLIGATORIO.
  // No hay fallback hardcodeado — la app debe fallar explícitamente si no está configurada.
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL no está configurado. ' +
    'Define esta variable en .env (ej: https://api.tudominio.com) antes de compilar para producción.'
  );
};

const API_BASE_URL = resolveApiBaseUrl();
```

### 2. Update `README.md` — Environment Variables section

Find the "Variables de entorno" table and update the `EXPO_PUBLIC_API_BASE_URL` row:

| Variable | Descripción |
|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | **OBLIGATORIO en producción**. URL del backend accesible desde el dispositivo (ej: `https://api.pereira-te-escucha.com`). No hay valor por defecto en producción — la app fallará al iniciar si no se define. En desarrollo local, si no se define, usa `http://localhost:3001` (iOS) o `http://10.0.2.2:3001` (Android). |

### 3. Update `.env.example` (root)

Ensure `EXPO_PUBLIC_API_BASE_URL` is present with a comment:

```env
# Backend API URL - OBLIGATORIO en producción
# Ejemplo producción: EXPO_PUBLIC_API_BASE_URL=https://api.pereira-te-escucha.com
# Desarrollo: si no se define, usa localhost/10.0.2.2 automáticamente
EXPO_PUBLIC_API_BASE_URL=
```

---

## Verification Gates

Run these commands in order. All must pass.

```bash
# 1. Check App.tsx no longer has hardcoded fallback
grep -n "api.pereira-pqrs.com" App.tsx
# Expected: NO MATCHES (empty output)

# 2. Check resolveApiBaseUrl throws in production
grep -A5 "EXPO_PUBLIC_API_BASE_URL no está configurado" App.tsx
# Expected: shows the throw new Error block

# 3. Check .env.example has the variable
grep "EXPO_PUBLIC_API_BASE_URL" .env.example
# Expected: EXPO_PUBLIC_API_BASE_URL=

# 4. Type-check (TypeScript)
npx tsc --noEmit 2>&1 | head -20
# Expected: no errors related to App.tsx

# 5. Simulate production build env (should throw)
EXPO_PUBLIC_API_BASE_URL= node -e "
  const resolveApiBaseUrl = () => {
    const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
    if (configuredUrl) return configuredUrl.replace(/\/+$/, '');
    if (false) return 'http://localhost:3001'; // __DEV__ = false
    throw new Error('EXPO_PUBLIC_API_BASE_URL no está configurado...');
  };
  try { resolveApiBaseUrl(); } catch(e) { console.log('OK - throws:', e.message); }
"
# Expected: "OK - throws: EXPO_PUBLIC_API_BASE_URL no está configurado..."

# 6. Simulate production with valid URL (should work)
EXPO_PUBLIC_API_BASE_URL=https://api.example.com node -e "
  const resolveApiBaseUrl = () => {
    const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
    if (configuredUrl) return configuredUrl.replace(/\/+$/, '');
    if (false) return 'http://localhost:3001';
    throw new Error('EXPO_PUBLIC_API_BASE_URL no está configurado...');
  };
  console.log('OK - returns:', resolveApiBaseUrl());
"
# Expected: "OK - returns: https://api.example.com"
```

---

## Files in Scope
- `App.tsx`
- `README.md`
- `.env.example`

## Files Explicitly Out of Scope
- `backend/.env.example`
- `backend/src/config.js`
- Any other files

---

## Conventions to Follow
- Error message in Spanish, matching existing style in `App.tsx`
- Throw `Error` (not `console.error` + `process.exit`) — lets Expo show redbox in dev
- Keep the `__DEV__` development fallback unchanged (localhost/10.0.2.2)
- JSDoc-style comment explaining the production requirement

---

## Test Plan
No unit tests exist for this function. Manual verification via the commands above is sufficient.

---

## Maintenance Note
When deploying to a new domain:
1. Set `EXPO_PUBLIC_API_BASE_URL=https://nuevo-dominio.com` in EAS build profile or `.env.production`
2. Rebuild the app — the validation runs at runtime on startup
3. No code changes needed

---

## STOP Conditions
- If `App.tsx` uses `API_BASE_URL` in places not shown above (search for all usages), STOP and report — all usages must be checked.
- If the project uses a different pattern for env validation elsewhere, STOP and align with that pattern.
- If TypeScript errors appear after the change, STOP and report — do not suppress errors.

---

## Git Commit Stamp
Run before executing: `git rev-parse --short HEAD`
Record the commit hash in the plan execution log.