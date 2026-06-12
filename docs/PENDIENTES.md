# Pendientes Consolidados — Pereira Te Escucha

Consolidación de deuda técnica, vulnerabilidades, inconsistencias y roadmap pendiente a partir de:

- `docs/AUDIT.md`
- `Auditoria del estado actual.md` (raíz)
- `docs/DocumentoTecnico.docx` (§6.2, §8.1, §8.2, §8.3)
- `docs/ROADMAP_PLAY_STORE.md`

---

## 1. Backend / Arquitectura

| # | Pendiente | Severidad | Fuente |
|---|-----------|-----------|--------|
| 1 | Separar `server.js` en módulos (API, bootstrap, worker, persistencia) | 🔴 Alta | AUDIT + DocTec §8.1 |
| 2 | Worker con reintentos automáticos + backoff exponencial | 🟡 Media | AUDIT + DocTec §6.2 + §8.3 |

---

## 2. Frontend

| # | Pendiente | Severidad | Fuente |
|---|-----------|-----------|--------|
| 3 | Refactor `App.tsx` en hooks/componentes (estado, polling, UI, geolocalización) | 🔴 Alta | AUDIT + DocTec §8.1 |
| 4 | Quitar fallback hardcodeado `https://api.pereira-pqrs.com` en `App.tsx` (línea 77) | 🔴 Alta | AUDIT + DocTec §8.2 |

---

## 3. Seguridad / Configuración

| # | Pendiente | Severidad | Fuente |
|---|-----------|-----------|--------|
| 5 | Cambiar `ALLOWED_ORIGIN=*` → origen específico en producción | 🔴 Crítico | AUDIT + DocTec §6.2 |
| 6 | HTTPS obligatorio en backend producción (certificado SSL) | 🔴 Crítico | DocTec §8.3 + ROADMAP |
| 7 | Validación de contenido real archivos (magic numbers con `file-type`) | 🔴 Alto | DocTec §6.2 + §8.3 |
| 8 | Hash SHA-256 de adjuntos en BD (columna ya existe pero no se implementa) | 🟡 Medio | DocTec §6.2 + §8.3 |
| 9 | Mejorar `sanitizeText` para cubrir más contextos o usar DOMPurify | 🟡 Medio | AUDIT + DocTec §6.2 |
| 10 | Añadir UUID v4 como sufijo en `trackingCode` para mayor entropía | 🔵 Bajo | DocTec §6.2 |

---

## 4. Validación / Pruebas

| # | Pendiente | Severidad | Fuente |
|---|-----------|-----------|--------|
| 11 | Tests integración para `/api/pqrs/submit-anonymous` (supertest + mock Playwright) | 🔴 Alto | DocTec §6.2 + §8.3 |
| 12 | Ampliar `validation.test.js`: max tamaño, max archivos, consentimiento, contratos error | 🟡 Media | AUDIT + DocTec §8.1 |
| 13 | Hacer `aceptarTratamiento` requerido explícito en el schema Zod | 🟡 Media | AUDIT + DocTec §8.2 |

---

## 5. DevOps / Publicación

| # | Pendiente | Severidad | Fuente |
|---|-----------|-----------|--------|
| 14 | Desplegar backend en servidor real con dominio + SSL | 🔴 Crítico | ROADMAP |
| 15 | Cuenta Google Play Console ($25) + build producción EAS | 🔴 Crítico | ROADMAP |
| 16 | Privacy Policy publicada en URL pública | 🔴 Crítico | ROADMAP |
| 17 | Términos de Servicio | 🟢 Bajo | ROADMAP |
| 18 | Assets Play Store: ícono 512x512, feature graphic 1024x500, screenshots | 🔴 Alto | ROADMAP |
| 19 | Configurar crash reporting (Sentry) + analytics | 🟡 Medio | DocTec §8.3 + ROADMAP |

---

## 6. Notas

### Archivos duplicados
- `docs/AUDIT.md` y `./Auditoria del estado actual.md` (raíz) son **idénticos** — eliminar uno.

### Documentación existente
- `DocumentoTecnico.docx` cubre la mayoría de los hallazgos. Las secciones más relevantes son:
  - §6.2 — Vulnerabilidades conocidas (pendientes)
  - §8.1 — Deuda técnica de arquitectura
  - §8.2 — Inconsistencias conocidas
  - §8.3 — Roadmap pendiente

---

## 7. Plan de Ejecución Sugerido

```
Fase 1 — Hardening crítico
├── #5  CORS específico en producción
├── #6  HTTPS backend
├── #4  Quitar fallback hardcodeado
└── #14 Despliegue backend con SSL

Fase 2 — Arquitectura
├── #1  Separar server.js
├── #3  Refactor App.tsx
└── #2  Retry worker

Fase 3 — Testing & Calidad
├── #11 Tests integración submit-anonymous
├── #12 Ampliar validation.test.js
└── #13 Consentimiento explícito Zod

Fase 4 — Seguridad archivos
├── #7  Magic numbers
└── #8  SHA-256 adjuntos

Fase 5 — Publicación Play Store
├── #15 Cuenta + build producción
├── #16 Privacy policy pública
├── #18 Assets tienda
└── #19 Sentry + analytics
```
