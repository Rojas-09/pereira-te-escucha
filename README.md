# Pereira Te Escucha

> Aplicación móvil para registrar solicitudes ciudadanas (PQRD) de forma simple, con radicación automática en el portal oficial de la Alcaldía de Pereira.

[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)](https://reactnative.dev)
[![Backend](https://img.shields.io/badge/Backend-Node%2FExpress-339933?logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Estado](https://img.shields.io/badge/Estado-En%20desarrollo-yellow)]()

---

## ¿Qué es esto?

**Pereira Te Escucha** es una app móvil (Android/iOS) que permite a cualquier ciudadano de Pereira registrar una petición, queja, reclamo, sugerencia o denuncia (PQRD) directamente desde su celular, sin necesidad de navegar el portal oficial del municipio.

La app captura el formulario, adjuntos y ubicación geográfica, los envía al backend propio, y un worker automatizado (Playwright) radica la solicitud en el portal oficial de la Alcaldía de Pereira en segundo plano. El ciudadano recibe un código de seguimiento inmediato y puede consultar el estado de su radicación en cualquier momento.

---

## Características principales

- **Formulario guiado** — campos validados, soporte para modo anónimo y con datos del solicitante.
- **Adjuntos multimedia** — fotos desde cámara o galería, archivos como evidencia.
- **Geolocalización** — ubica el punto exacto del reporte en un mapa.
- **Radicación automática** — Playwright radica en el portal oficial sin intervención manual.
- **Seguimiento asíncrono** — código de tracking desde el primer segundo; el estado se actualiza cuando el portal responde.
- **Cola de trabajos interna** — el backend persiste y reintenta si el portal externo falla.

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| App móvil | Expo SDK 54 · React Native 0.81 · TypeScript 5.9 |
| UI / fuentes | Expo Linear Gradient · Sora (Google Fonts) |
| Mapas | react-native-maps 1.20 |
| Backend API | Node.js · Express 4 · ES Modules |
| Validación | Zod 3.24 |
| Base de datos | PostgreSQL (pg 8.20) |
| Automatización | Playwright 1.53 (Chromium) |
| Seguridad | Helmet · express-rate-limit · sanitización XSS |
| Logging | pino-http |
| Builds móviles | EAS Build (Expo Application Services) |

---

## Arquitectura

```
┌─────────────────┐     multipart/form-data      ┌──────────────────────┐
│  App Expo        │ ──────────────────────────▶ │  Backend Express      │
│  (App.tsx)       │                              │  (server.js)          │
│                  │ ◀────────── trackingCode ─── │                       │
│  polling         │                              │  ┌──────────────────┐ │
│  GET /status/:id │ ──────────────────────────▶ │  │  PostgreSQL       │ │
└─────────────────┘                              │  └──────┬───────────┘ │
                                                  │         │ worker       │
                                                  │  ┌──────▼───────────┐ │
                                                  │  │  Playwright       │ │
                                                  │  │  (Chromium)       │ │
                                                  │  └──────┬───────────┘ │
                                                  └─────────┼─────────────┘
                                                            │
                                                  ┌─────────▼─────────────┐
                                                  │  Portal Oficial        │
                                                  │  Alcaldía de Pereira   │
                                                  └───────────────────────┘
```

Ver diagrama completo con Mermaid en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Estructura del proyecto

```
pereira-te-escucha/
├── App.tsx                  # Entrada principal — UI, polling, lógica de envío
├── app.json                 # Configuración Expo (permisos, íconos, package)
├── eas.json                 # Perfiles de build EAS (development/preview/production)
├── assets/                  # Íconos y splash screen
├── backend/
│   ├── src/
│   │   ├── server.js        # API HTTP + worker + gestión de estados
│   │   ├── validation.js    # Validación y sanitización de inputs (Zod)
│   │   ├── pereiraAutomation.js  # Automatización del portal con Playwright
│   │   └── db.js            # Conexión a PostgreSQL
│   ├── scripts/
│   │   └── local-setup.cjs  # Bootstrap local con Docker y esquema de DB
│   └── .env.example
└── docs/
    ├── ARCHITECTURE.md      # Diagrama y descripción de componentes
    ├── AUDIT.md             # Hallazgos de deuda técnica y vulnerabilidades
    ├── PRIVACY_POLICY.md    # Política de privacidad (requerida por Play Store)
    └── ROADMAP_PLAY_STORE.md
```

---

## Setup local

### Requisitos

- **Node.js** ≥ 20
- **Docker Desktop** (para PostgreSQL local)
- **Android Studio** con emulador (para pruebas en Android) o dispositivo físico con Expo Dev Client

### 1. Instalar dependencias

```bash
# Desde la raíz del proyecto
npm install

# Instalar dependencias del backend y Playwright
cd backend && npm install && npx playwright install chromium
```

### 2. Preparar entorno local (DB + .env)

```bash
npm run local:setup
```

Este comando:
- Levanta un contenedor PostgreSQL en Docker
- Crea el esquema de tablas necesario
- Genera `backend/.env` a partir del ejemplo

### 3. Iniciar servicios

```bash
# Terminal 1 — backend
npm run local:backend

# Terminal 2 — app Expo
npm run app:dev
```

O bien, ambos a la vez:

```bash
npm run dev
```

### Variables de entorno

Copia y ajusta los archivos de ejemplo:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

| Variable | Descripción |
|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | URL del backend accesible desde el dispositivo |
| `EXPO_PUBLIC_BACKEND_API_TOKEN` | Token opcional si el backend tiene auth activada |
| `EXPO_PUBLIC_SUBMIT_TIMEOUT_MS` | Tiempo máximo de espera al radicar (ms) |
| `DATABASE_URL` | Conexión a PostgreSQL |
| `PEREIRA_FORM_URL` | URL del formulario oficial de Pereira |
| `PLAYWRIGHT_TIMEOUT_MS` | Tiempo máximo del proceso de radicación automática |
| `ALLOWED_ORIGIN` | Origen permitido en CORS (**nunca usar `*` en producción**) |

---

## Comandos de desarrollo

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Backend + app Expo simultáneamente |
| `npm run local:backend` | Solo el backend |
| `npm run app:dev` | Expo con dev client |
| `npm run app:dev:lan` | Expo en modo LAN (fallback recomendado) |
| `npm run app:dev:tunnel` | Expo por túnel Ngrok |
| `npm run app:dev:win` | `adb reverse` + LAN (Windows + Android por USB) |
| `npm run local:setup` | Bootstrap completo del entorno local |
| `npm run local:setup:fast` | Re-setup rápido (sin reinstalar deps) |

---

## Build y publicación (Android / Play Store)

```bash
# Development build
eas build --profile development --platform android

# Producción
eas build --profile production --platform android
```

Ver checklist completo en [`docs/ROADMAP_PLAY_STORE.md`](docs/ROADMAP_PLAY_STORE.md).

> **Nota:** el build number es administrado automáticamente por EAS (`appVersionSource: remote`). Para actualizar la versión visible al usuario, editar `expo.version` en `app.json` y `version` en `package.json` de forma sincronizada.

---

## Documentación adicional

| Documento | Contenido |
|-----------|-----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Diagrama de componentes y flujo de datos |
| [`docs/AUDIT.md`](docs/AUDIT.md) | Deuda técnica, inconsistencias y vulnerabilidades identificadas |
| [`docs/PRIVACY_POLICY.md`](docs/PRIVACY_POLICY.md) | Política de privacidad (requerida por Google Play) |
| [`docs/ROADMAP_PLAY_STORE.md`](docs/ROADMAP_PLAY_STORE.md) | Checklist para publicación en Play Store |
| [`backend/README.md`](backend/README.md) | Setup y contrato técnico del backend |
| [`backend/INSPECCION_PEREIRA.md`](backend/INSPECCION_PEREIRA.md) | Análisis técnico del portal oficial de Pereira |

---

## Estado del proyecto

| Módulo | Estado |
|--------|--------|
| App móvil (UI + formulario) | ✅ Funcional |
| Backend API + validación | ✅ Funcional |
| Radicación con Playwright | ✅ Funcional (sujeto a cambios del portal externo) |
| Seguimiento asíncrono | ✅ Funcional |
| Tests unitarios backend | 🚧 Parcial — solo validación |
| HTTPS en producción | ⏳ Pendiente |
| Publicación Play Store | ⏳ Pendiente |

---

## Contribuir

Este proyecto es parte de un trabajo académico de la **Universidad Tecnológica de Pereira**. Si encontrás un bug o tenés una sugerencia, abrí un Issue. PRs bienvenidos con descripción clara del cambio.

---

## Licencia

MIT © 2024 Juan Andrés Rojas — ver [`LICENSE`](LICENSE) para detalles.

> **Aviso:** este proyecto no tiene afiliación oficial con la Alcaldía de Pereira. Automatiza el portal público de PQRD con fines académicos y de accesibilidad ciudadana.