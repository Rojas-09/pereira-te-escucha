# Plan 015 — Play Store: Sentry + Analytics

**Finding:** The app has no crash reporting (Sentry) or analytics. This means crashes in production are invisible to the developer, and there's no data on how users interact with the app. For Play Store apps, crash reporting is strongly recommended.
**Category:** DevOps / Monitoring
**Impact:** MEDIUM — production crashes go undetected
**Effort:** S (Small)
**Risk:** LOW — additive, no existing monitoring to disrupt
**Evidence:** `docs/ROADMAP_PLAY_STORE.md` (mentions sentry and analytics as pending)

---

## Current State

No crash reporting or analytics configured. The app currently:
- Uses `console.log` for debugging (visible only in dev)
- Has no error tracking for production
- Has no insight into user behavior or crash rates

---

## Required Changes

### 1. Install Sentry SDK

```bash
npm install @sentry/react-native
# For Expo, use the expo wrapper:
npx expo install @sentry/react-native

# Run the Sentry wizard to configure native builds
npx sentry-wizard -i reactNative -p ios android
```

### 2. Configure Sentry in `App.tsx`

Add at the very top of the file (before any other imports, or right after imports):

```tsx
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://YOUR_DSN_HERE@oXXXXXX.ingest.sentry.io/XXXXXX',
  // Environment detection: production vs development
  environment: __DEV__ ? 'development' : 'production',
  // Only track actual errors in production (breadcrumbs in dev)
  enabled: !__DEV__,
  // Performance tracking (optional — add tracesSampleRate for basic perf)
  tracesSampleRate: 0.2, // 20% of sessions get performance tracking
  // Capture additional context
  attachScreenshot: true, // Useful for UI errors
});
```

### 3. Add error boundaries

Wrap the app with Sentry's error boundary at the `export default function App()` level:

```tsx
// After Sentry.init({...}), at the end of App.tsx:

export default Sentry.wrap(App);
```

Or use the ErrorBoundary component for more granular control:

```tsx
// Inside the render, wrap the return:
return (
  <Sentry.ErrorBoundary
    fallback={({ error }) => (
      <View style={styles.loader}>
        <Text>Ocurrió un error inesperado. Por favor, reinicia la aplicación.</Text>
      </View>
    )}
  >
    <LinearGradient colors={['#e8f7f2', '#ecf8ff', '#fffaf0']} style={styles.gradient}>
      {/* ... existing content ... */}
    </LinearGradient>
  </Sentry.ErrorBoundary>
);
```

### 4. Track key events (optional analytics)

Add breadcrumbs for key user actions:

```tsx
// After successful submission:
Sentry.addBreadcrumb({
  category: 'submission',
  message: `PQRD submitted: ${selectedType}`,
  level: 'info',
});

// After failed submission:
Sentry.captureMessage('PQRD submission failed', {
  level: 'warning',
  extra: {
    errorMessage: errorMessage,
    apiUrl: API_BASE_URL,
  },
});

// In map step:
Sentry.addBreadcrumb({
  category: 'ui',
  message: 'User selected location on map',
  level: 'info',
});

// In step transitions:
Sentry.addBreadcrumb({
  category: 'navigation',
  message: `Step changed to ${currentStep}`,
  data: { step: currentStep },
  level: 'info',
});
```

### 5. Create `backend/src/services/monitoring.service.js` (optional — backend Sentry)

For the backend, install:
```bash
cd backend && npm install @sentry/node
```

And add to `backend/src/server.js`:
```js
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://YOUR_DSN_HERE@oXXXXXX.ingest.sentry.io/XXXXXX',
  environment: NODE_ENV || 'development',
  enabled: NODE_ENV === 'production',
  tracesSampleRate: 0.1,
});
```

Add Sentry error handler middleware to `backend/src/app.js`:
```js
import * as Sentry from '@sentry/node';

// Add BEFORE other error handlers
app.use(Sentry.Handlers.requestHandler());

// In routes:
Sentry.setTag('endpoint', req.path);

// Add AFTER all routes, before the final error handler:
app.use(Sentry.Handlers.errorHandler());
```

### 6. Get a Sentry DSN

1. Go to https://sentry.io/ (their free tier is generous: 5k events/month)
2. Create an account
3. Create a new React Native project
4. Copy the DSN string

---

## Verification Gates

```bash
# 1. Check Sentry installed
grep -c "@sentry/react-native" package.json
# Expected: 1 (dependency present)

# 2. Check DSN is configured (not empty)
grep "dsn:" App.tsx | grep "https://"
# Expected: shows non-empty DSN

# 3. Check EAS build includes Sentry
# Run a development build:
npx eas build --profile development --platform android
# Sentry native SDK requires native build (not Expo Go)

# 4. Verify Sentry catches errors
# Manual: Force a crash in dev to test (temporarily add to App.tsx):
// throw new Error('Sentry test error');
# Check Sentry dashboard for the event
```

---

## Files in Scope
- `App.tsx` — add Sentry.init, ErrorBoundary, breadcrumbs
- `backend/src/server.js` — add Sentry.init
- `backend/src/app.js` — add Sentry error handler middleware
- `package.json` — add @sentry/react-native

## Files Explicitly Out of Scope
- `backend/src/validation.js`
- `backend/src/worker.js`

---

## Configuration

Add to `.env` (and `.env.example`):
```env
# Sentry (crash reporting)
EXPO_PUBLIC_SENTRY_DSN=https://your-dsn@oXXXXXX.ingest.sentry.io/XXXXXX
```

And in `App.tsx`:
```tsx
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  enabled: !__DEV__,
});
```

---

## Cost
Sentry free tier: **5,000 events/month, 1 user** — sufficient for initial launch.

---

## STOP Conditions
- If the Sentry DSN is exposed in the source (it's client-side and meant to be public), that's fine — Sentry DSNs are designed to be public
- If the build fails after adding Sentry, check that native modules are linked correctly: `npx expo prebuild --clean`
- If Sentry wizard asks to modify native code, accept the changes (they're needed for native crash reporting)
