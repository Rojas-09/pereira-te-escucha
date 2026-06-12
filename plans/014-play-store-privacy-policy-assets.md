# Plan 014 — Play Store: Privacy Policy + Assets

**Finding:** Google Play Store requires a published Privacy Policy URL and specific graphic assets (icon, feature graphic, screenshots) before the app can be published. The project has `docs/PRIVACY_POLICY.md` but it's a local file, not a published URL. App icon exists in `assets/` but Play Store needs 512x512px icon and 1024x500px feature graphic.
**Category:** Publishing
**Impact:** CRITICAL — blocks Play Store submission
**Effort:** M (Medium)
**Risk:** LOW — design/marketing work
**Evidence:** `docs/ROADMAP_PLAY_STORE.md`, `docs/PRIVACY_POLICY.md`

---

## Current State

- `docs/PRIVACY_POLICY.md` — exists, well-written, but is a local file
- `assets/icon.png` — exists, used for app icon
- `assets/splash-icon.png` — exists, used for splash
- Google Play requires: 512x512px icon, 1024x500px feature graphic, screenshots (2-8)
- No Terms of Service document

---

## Required Changes

### Step 1: Publish Privacy Policy

**Option A: GitHub Pages (free, recommended)**
1. Create `docs/index.html` or use a service
2. Push to GitHub and enable GitHub Pages
3. Policy URL: `https://rojas-09.github.io/pereira-te-escucha/privacy-policy`

**Option B: Use a free privacy policy host (easier)**
https://www.privacypolicygenerator.info/ or similar

**Option C: Deploy via Vercel/Railway/**
Simple static HTML page deployed anywhere

**Create `docs/privacy-policy.html`:**
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidad - Pereira Te Escucha</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 700px; margin: auto; padding: 20px; line-height: 1.6; }
    h1 { color: #0e766e; }
  </style>
</head>
<body>
  <h1>Política de Privacidad</h1>
  <p><strong>Última actualización:</strong> Abril 2026</p>
  <p>Esta aplicación móvil, <strong>Pereira Te Escucha</strong>, es mantenida por <strong>Juan Andrés Rojas</strong> como parte de un proyecto académico de la Universidad Tecnológica de Pereira.</p>
  
  <h2>1. Datos que recopilamos</h2>
  <ul>
    <li><strong>Datos del formulario:</strong> nombre, documento de identidad, correo electrónico, teléfono (proporcionados voluntariamente por el usuario).</li>
    <li><strong>Ubicación geográfica:</strong> coordenadas del punto del reporte (solo cuando el usuario da permiso y selecciona una ubicación).</li>
    <li><strong>Archivos adjuntos:</strong> fotos y documentos que el usuario decida adjuntar a su solicitud.</li>
  </ul>

  <h2>2. Uso de los datos</h2>
  <p>Los datos recopilados se utilizan exclusivamente para:</p>
  <ul>
    <li>Radicar la PQRS en el portal oficial de la Alcaldía de Pereira.</li>
    <li>Generar un código de seguimiento para que el usuario consulte el estado de su solicitud.</li>
  </ul>

  <h2>3. Almacenamiento y seguridad</h2>
  <p>Los datos se almacenan temporalmente en nuestro servidor backend para procesar la radicación. Se implementan medidas de seguridad como encriptación en tránsito (HTTPS) y controles de acceso mediante tokens API.</p>

  <h2>4. Compartición de datos</h2>
  <p>Los datos se envían al portal oficial de la Alcaldía de Pereira exclusivamente para el trámite de la PQRS. No compartimos datos con terceros para fines comerciales o publicitarios.</p>

  <h2>5. Retención de datos</h2>
  <p>Los datos se conservan mientras sea necesario para el seguimiento de la solicitud y conforme a los plazos legales aplicables en Colombia.</p>

  <h2>6. Derechos del usuario</h2>
  <p>El usuario puede solicitar la eliminación de sus datos contactando a <a href="mailto:juan.rojas7@utp.edu.co">juan.rojas7@utp.edu.co</a>.</p>

  <h2>7. Cambios a esta política</h2>
  <p>Nos reservamos el derecho de actualizar esta política de privacidad en cualquier momento. Los cambios serán notificados mediante una actualización de la aplicación.</p>

  <h2>8. Contacto</h2>
  <p>Para preguntas sobre esta política: <a href="mailto:juan.rojas7@utp.edu.co">juan.rojas7@utp.edu.co</a></p>
</body>
</html>
```

### Step 2: Create Play Store Assets

**Required assets (minimum):**

| Asset | Size | File | Notes |
|-------|------|------|-------|
| App Icon | 512x512px PNG | `assets/play-icon-512.png` | Same design as `android-icon-foreground.png` |
| Feature Graphic | 1024x500px PNG | `assets/feature-graphic.png` | Banner at top of Play Store listing |
| Phone Screenshot | min 320px, max 3840px | `assets/screenshots/` | 2-8 screenshots showing key screens |

**Feature graphic design guidelines:**
- No device frame/browser mockup
- No text at bottom 10% (may be cropped)
- Safe zone: center 1024x400
- Use brand colors: teal (#0e766e), white

**Screenshots to take:**
1. Map screen (step 1) — location selection
2. Type/message screen (step 2) — PQRD type and context
3. Photos/personal data (step 3) — evidence upload
4. Formal letter (step 4) — generated formal text
5. Success/tracking (step 5) — tracking code display

### Step 3: Screenshot automation script

Create `scripts/capture-screenshots.js` to take screenshots via Android emulator or using `adb`:

```bash
# Manual approach (recommended):
# 1. Build and install development APK
npx eas build --profile preview --platform android
# 2. Install on emulator
# 3. Use Android Studio's Device Explorer or adb to capture screenshots
adb shell screencap /sdcard/screenshot.png
adb pull /sdcard/screenshot.png assets/screenshots/
```

### Step 4: Create Terms of Service

Create `docs/TERMS_OF_SERVICE.md`:
```md
# Términos de Servicio — Pereira Te Escucha

## 1. Aceptación de términos
Al usar esta aplicación, aceptas los siguientes términos de servicio.

## 2. Descripción del servicio
Pereira Te Escucha es una herramienta que facilita la radicación de PQRD ante la Alcaldía de Pereira mediante automatización del portal oficial.

## 3. Uso responsable
El usuario se compromete a proporcionar información veraz y a no usar la aplicación para fines ilícitos.

## 4. Limitación de responsabilidad
La aplicación es una herramienta de intermediación técnica. No nos hacemos responsables por demoras en el portal oficial, cambios en el formulario gubernamental, o decisiones de la administración municipal.

## 5. Modificaciones
Nos reservamos el derecho de modificar o discontinuar el servicio en cualquier momento.

## 6. Contacto
juan.rojas7@utp.edu.co
```

### Step 5: Update `.gitignore` for screenshots

Ensure `assets/screenshots/` is tracked but any generated file is versioned:

```gitignore
# Already in .gitignore — screenshots should be committed
```

---

## Verification Gates

```bash
# 1. Verify all asset files exist
ls -la assets/play-icon-512.png 2>/dev/null && echo "OK" || echo "MISSING: play-icon-512.png"
ls -la assets/feature-graphic.png 2>/dev/null && echo "OK" || echo "MISSING: feature-graphic.png"
ls assets/screenshots/*.png 2>/dev/null | wc -l | xargs -I{} echo "Screenshots: {} files"

# 2. Verify image dimensions
file assets/play-icon-512.png | grep "512 x 512" && echo "OK icon size" || echo "ICON WRONG SIZE"
file assets/feature-graphic.png | grep "1024 x 500" && echo "OK feature graphic size" || echo "FEATURE GRAPHIC WRONG SIZE"

# 3. Check privacy policy HTML is valid
grep -c "</html>" docs/privacy-policy.html && echo "HTML valid" || echo "HTML may be incomplete"

# 4. Verify policy URL is accessible (after publishing)
curl -s -o /dev/null -w "%{http_code}" https://rojas-09.github.io/pereira-te-escucha/privacy-policy
# Expected: 200
```

---

## Files in Scope
- `docs/privacy-policy.html` — CREATE
- `docs/TERMS_OF_SERVICE.md` — CREATE
- `assets/play-icon-512.png` — CREATE (from existing icon, resize to 512x512)
- `assets/feature-graphic.png` — CREATE (design from scratch)
- `assets/screenshots/` — CREATE directory + screenshots
- `docs/PRIVACY_POLICY.md` — keep as reference, HTML version is for publishing

---

## Design Resources
- Canva: free feature graphic templates
- ImageMagick: `convert assets/icon.png -resize 512x512 assets/play-icon-512.png`
- GIMP: for feature graphic design

---

## STOP Conditions
- If Google Play rejects the privacy policy format, adjust to match current requirements
- If feature graphic doesn't meet Play Store guidelines (changed in 2025-2026), STOP and research current specs
