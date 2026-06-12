# Plan 013 — Play Store: Account + Production Build

**Finding:** The project cannot be published to Google Play Store without a Google Play Console account ($25 one-time fee) and a signed production build via EAS. The app is functionally complete but has no deployment pipeline.
**Category:** DevOps / Deployment
**Impact:** CRITICAL — blocks publishing
**Effort:** L (Large — mostly one-time setup, ~2-3 hours)
**Risk:** MEDIUM — Play Store policies change, account creation is manual
**Evidence:** `docs/ROADMAP_PLAY_STORE.md`

---

## Prerequisites (External, Must Do First)

These are manual steps the developer must complete outside of code:

### 1. Create Google Play Console Account
1. Go to https://play.google.com/console/
2. Sign in with a Google account (create a dedicated dev account if possible)
3. Pay the **$25 USD** one-time registration fee
4. Complete account details: developer name, email, phone, address
5. Accept the Developer Distribution Agreement

### 2. Generate App Signing Key
EAS Build will handle this automatically via Google Play App Signing, but you can also provide your own keystore:

```bash
# Option A: Let EAS generate it (recommended)
# Just run `eas build --platform android` and EAS manages keys

# Option B: Manual keystore (if you prefer control)
keytool -genkey -v -keystore pq-ia-app-key.keystore \
  -alias pq-ia-app \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

---

## Required Code Changes

### 1. Update `app.json` with Play Store metadata

**`app.json`** — ensure these fields are set:

```json
{
  "expo": {
    "name": "Pereira Te Escucha",
    "slug": "pq-ia-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "android": {
      "package": "com.rojas09.pqiaapp",
      "versionCode": 1,
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "permissions": [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.RECORD_AUDIO"
      ]
    },
    "extra": {
      "eas": {
        "projectId": "c9370033-d12a-4959-9d99-5345a2a2124d"
      }
    }
  }
}
```

Make sure `versionCode` is an integer (1 for first release, increment on each update).

### 2. Update `eas.json` — production profile

**`eas.json`:**
```json
{
  "cli": {
    "version": ">= 16.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://api.pereira-te-escucha.com",
        "EXPO_PUBLIC_BACKEND_API_TOKEN": "",
        "EXPO_PUBLIC_SUBMIT_TIMEOUT_MS": "60000"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "production"
      }
    }
  }
}
```

### 3. Create production `.env.production` file

```env
# Backend API URL — must be HTTPS in production
EXPO_PUBLIC_API_BASE_URL=https://api.pereira-te-escucha.com
# Backend auth token (set this to match backend's BACKEND_API_TOKEN)
EXPO_PUBLIC_BACKEND_API_TOKEN=your-production-token-here
# Timeout for submission (60s for production)
EXPO_PUBLIC_SUBMIT_TIMEOUT_MS=60000
```

### 4. Add `build-number` script (optional)

Install `@expo/config` for automated versionCode bumps:

```bash
npm install --save-dev @expo/config
# Or use EAS's built-in appVersionSource: remote (already in config)
```

---

## Build Steps

### Step 1: Login to Expo/EAS

```bash
npx eas login
# Follow the prompt to authenticate
```

### Step 2: Create production build

```bash
npx eas build --platform android --profile production
```

This produces an **Android App Bundle (AAB)** signed by Expo's build service.

### Step 3: Download the AAB

After the build completes, EAS provides a download URL. You can also access it:
- In terminal: the build URL is printed
- On https://expo.dev → your project → builds

### Step 4: Create Google Play Console listing

1. Go to Google Play Console → "Create app"
2. Fill in:
   - App name: "Pereira Te Escucha"
   - Default language: Spanish (Latin America) — es-419
   - App or game: App
   - Free or paid: Free
3. Complete the Store Listing:
   - Short description (80 chars max): "Radica PQRD en Pereira desde tu celular"
   - Full description: Copy from README.md
   - Screenshots: See Plan 014
   - Icon, Feature Graphic, Screenshots: See Plan 014
4. Set up Content Rating questionnaire
5. Set up App Content (Privacy Policy URL required — See Plan 014)

### Step 5: Upload the AAB

1. Go to Play Console → Production → "Create new release"
2. Upload the `.aab` file from EAS
3. Fill in release notes (in Spanish):
   ```
   Primera versión de Pereira Te Escucha.
   - Radicación de PQRD anónima
   - Adjuntos multimedia
   - Geolocalización
   - Seguimiento en tiempo real
   ```
4. Review and start rollout

---

## One-Time Google Play Setup

### Google Play App Signing
EAS Build automatically enables Google Play App Signing. If you use a custom keystore, upload the public key to Google Play Console.

### Service Account for Automated Submissions (Optional)
For `eas submit` automation:

1. Go to Google Cloud Console
2. Create a service account or select the one EAS created
3. Grant "Admin" permission in Play Console → Users & Permissions
4. Download the JSON key
5. Save as `google-play-service-account.json` in project root
6. Add to `.gitignore`

---

## Verification Gates

```bash
# 1. Check app.json has correct android config
node -e "
  const config = require('./app.json');
  const android = config.expo.android;
  console.log('Package:', android.package);
  console.log('VersionCode:', android.versionCode);
  console.log('Permissions:', android.permissions.length);
"

# 2. Check EAS build profile
node -e "
  const config = require('./eas.json');
  const prod = config.build.production;
  console.log('Build type:', prod.android.buildType);
  console.log('Env vars:', Object.keys(prod.env || {}));
"

# 3. Try EAS build (dry run)
npx eas build --platform android --profile production --dry-run
# Expected: validates config without uploading

# 4. Verify AAB was created after build
# The build outputs an .aab file — check EAS dashboard
```

---

## Files in Scope
- `app.json` — verify versionCode and config
- `eas.json` — verify production build profile
- `.env.production` — CREATE (new file)
- `.gitignore` — add `google-play-service-account.json`

## Files Explicitly Out of Scope
- `backend/` files (no backend changes needed)
- `App.tsx` (no code changes needed)

---

## Conventions to Follow
- App names match existing branding ("Pereira Te Escucha")
- Version codes increment by 1 for each release
- Privacy policy URL must be HTTPS (see Plan 014)
- EAS `appVersionSource: remote` manages versionCode automatically

---

## Test Plan
1. Production build succeeds via `eas build`
2. AAB file is generated
3. Google Play Console accepts the upload

---

## Important Notes

### Costs
- **$25 USD** — Google Play Developer account (one-time)
- **EAS Build** — Free tier includes 30 builds/month (sufficient for this project)
- **Backend hosting** — separate cost (VPS, Railway, Render, etc.)

### Timeline
- Play Console account approval: usually instant for individual accounts
- App review by Google: 1-7 days (first submission may take longer)
- Content rating: fills automatically after questionnaire

### Common Rejection Reasons
- Missing privacy policy (see Plan 014)
- Broken functionality (test thoroughly before submitting)
- Insufficient permissions justification
- No login/signup (this app is anonymous, which is fine)
