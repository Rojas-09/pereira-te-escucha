# Plan 017 — Terms of Service Document + Publication

**Finding:** The Play Store roadmap (`docs/ROADMAP_PLAY_STORE.md`) lists "Términos de Servicio" as optional but recommended. Plan 014 included a brief draft, but it needs a dedicated plan for proper creation, review, and publication. A published Terms of Service URL protects the developer from liability and is considered a best practice for production apps.
**Category:** Legal / Publishing
**Impact:** LOW — optional for Play Store submission, but recommended for liability protection
**Effort:** S (Small)
**Risk:** LOW — text document, no code changes
**Evidence:** `docs/ROADMAP_PLAY_STORE.md` item #17, `plans/014-play-store-privacy-policy-assets.md` (Step 4)

---

## Current State

- `docs/PRIVACY_POLICY.md` — exists (good)
- `docs/ROADMAP_PLAY_STORE.md` — lists Términos de Servicio as "opcional pero recomendado"
- Plan 014 includes a brief draft as Step 4, but no dedicated plan for tracking
- No published Terms of Service URL exists

---

## Required Changes

### Step 1: Create `docs/TERMS_OF_SERVICE.md`

```md
# Términos de Servicio — Pereira Te Escucha

**Última actualización:** Abril 2026

## 1. Aceptación de términos
Al descargar, instalar o usar la aplicación **Pereira Te Escucha**, aceptas estos términos de servicio en su totalidad. Si no estás de acuerdo, no uses la aplicación.

## 2. Descripción del servicio
Pereira Te Escucha es una herramienta tecnológica que facilita a los ciudadanos la radicación de Peticiones, Quejas, Reclamos, Sugerencias y Denuncias (PQRSD) ante la Alcaldía de Pereira. La aplicación automatiza el envío de información al portal oficial de la entidad.

## 3. Naturaleza del servicio
- La aplicación actúa como un **intermediario técnico** entre el ciudadano y el portal oficial de PQRSD.
- No reemplaza los canales oficiales de atención.
- No garantiza tiempos de respuesta específicos por parte de la Alcaldía.
- El radicado oficial es emitido por el sistema de la Alcaldía, no por esta aplicación.

## 4. Responsabilidades del usuario
El usuario se compromete a:
- Proporcionar información veraz, completa y actualizada.
- No usar la aplicación para fines ilícitos o fraudulentos.
- No intentar manipular, vulnerar o interrumpir el funcionamiento del servicio.
- Usar la aplicación de acuerdo con las leyes de la República de Colombia.

## 5. Limitación de responsabilidad
El desarrollador de Pereira Te Escucha **no se hace responsable** por:
- Demoras en la radicación causadas por el portal oficial de la Alcaldía.
- Cambios en el formulario, requisitos o procedimientos del portal gubernamental.
- Decisiones, respuestas o falta de respuesta por parte de la administración municipal.
- Daños derivados del uso indebido de la aplicación por parte del usuario.
- Pérdida de datos por causas fuera del control razonable del servicio.

## 6. Propiedad intelectual
El código fuente, diseño, nombre e iconografía de Pereira Te Escucha son propiedad de su desarrollador. El usuario recibe una licencia limitada, no exclusiva e intransferible para usar la aplicación.

## 7. Privacidad
El tratamiento de datos personales se rige por la **Política de Privacidad** de la aplicación, disponible en [URL de la política de privacidad].

## 8. Modificaciones del servicio
Nos reservamos el derecho de:
- Actualizar, modificar o discontinuar el servicio en cualquier momento.
- Actualizar estos términos sin previo aviso.
- Los cambios entrarán en vigor al publicarse la versión actualizada.

## 9. Legislación aplicable
Estos términos se rigen por las leyes de la República de Colombia. Cualquier controversia será sometida a los tribunales competentes de Pereira, Risaralda.

## 10. Contacto
Para preguntas sobre estos términos:
- **Correo:** juan.rojas7@utp.edu.co
- **Desarrollador:** Juan Andrés Rojas
- **Institución:** Universidad Tecnológica de Pereira (proyecto académico)

---

*Al usar Pereira Te Escucha, aceptas estos términos en su totalidad.*
```

### Step 2: Create `docs/terms-of-service.html` (for web publishing)

Convert the markdown to a clean HTML page matching the privacy policy style:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Términos de Servicio - Pereira Te Escucha</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 700px; margin: auto; padding: 20px; line-height: 1.6; }
    h1 { color: #0e766e; }
    h2 { color: #333; margin-top: 24px; }
  </style>
</head>
<body>
  <h1>Términos de Servicio</h1>
  <p><strong>Última actualización:</strong> Abril 2026</p>

  <!-- Full content from TERMS_OF_SERVICE.md formatted as HTML sections -->
  <!-- ... (content omitted for brevity, use the markdown as source) -->
</body>
</html>
```

### Step 3: Publish alongside Privacy Policy

Both documents should be published to the same URL base:
- `https://rojas-09.github.io/pereira-te-escucha/privacy-policy`
- `https://rojas-09.github.io/pereira-te-escucha/terms-of-service`

### Step 4: Update Play Store listing

When filling in the Play Store listing, add the Terms of Service URL in the appropriate field (if Play Console requires it) or reference it in the app description.

### Step 5: Add link in app

Optionally add a "Términos de Servicio" link in the app's settings or about screen. This can be done in a future UI update.

---

## Verification Gates

```bash
# 1. Verify both documents exist
ls -la docs/TERMS_OF_SERVICE.md docs/terms-of-service.html 2>/dev/null && echo "OK" || echo "MISSING files"

# 2. Verify HTML is valid
grep -c "</html>" docs/terms-of-service.html && echo "HTML valid" || echo "HTML may be incomplete"

# 3. Verify URL is accessible (after publishing)
curl -s -o /dev/null -w "%{http_code}" https://rojas-09.github.io/pereira-te-escucha/terms-of-service
# Expected: 200

# 4. Both documents link to each other (optional but recommended)
grep -c "Términos de Servicio" docs/PRIVACY_POLICY.md     # Optional cross-link
grep -c "Política de Privacidad" docs/TERMS_OF_SERVICE.md  # Should reference privacy policy
```

---

## Files in Scope
- `docs/TERMS_OF_SERVICE.md` — CREATE
- `docs/terms-of-service.html` — CREATE (for web publishing)

## Files Explicitly Out of Scope
- `docs/PRIVACY_POLICY.md` — no changes (already exists)
- `docs/privacy-policy.html` — no changes (created by Plan 014)
- Any backend or frontend code

---

## Dependencies
- Plan 014 (privacy policy + assets) — should be executed first to set up the publishing mechanism
- Publishing via GitHub Pages or similar (same mechanism as privacy policy)

---

## Test Plan
1. Document review: read `docs/TERMS_OF_SERVICE.md` for completeness
2. HTML validation: `docs/terms-of-service.html` renders correctly
3. URL check: published URL returns 200

---

## STOP Conditions
- If Play Store's Terms of Service requirements change (verify current Play Console requirements), STOP and adjust
- If the legal language needs review (consider consulting a legal professional for production use), STOP and flag
