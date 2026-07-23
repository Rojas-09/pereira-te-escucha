# Pereira Te Escucha

> Aplicación móvil para registrar solicitudes ciudadanas (PQRD) de forma simple, con radicación automática en el portal oficial de la Alcaldía de Pereira.

[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)](https://reactnative.dev)
[![Backend](https://img.shields.io/badge/Backend-Node%2FExpress-339933?logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Estado](https://img.shields.io/badge/Estado-Activo-brightgreen)]()

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
| Automatización | Playwright 1.61 (Chromium) |
| Cola de trabajos | Redis + BullMQ |
| Seguridad | Helmet · express-rate-limit · sanitización XSS |
| Logging | pino-http |
| Builds móviles | EAS Build (Expo Application Services) |

---

## Arquitectura

```
┌─────────────────┐     multipart/form-data      ┌──────────────────────────┐
│  App Expo        │ ──────────────────────────▶ │  Backend Express          │
│  (App.tsx         │                              │  (server.js)              │
│   + componentes) │                              └────┬─────────┬───────────┘
│                  │ ◀────────── trackingCode ───      │         │
│  polling         │                         ┌────────▼──┐  ┌────▼──────────┐
│  GET /status/:id │ ───────────────────────▶ │ PostgreSQL│  │  Redis        │
└─────────────────┘                         └────────┬──┘  │  (BullMQ)     │
                                                      │     └────┬──────────┘
                                                      │ worker   │ job
                                                      │ ┌────────▼──────────┐
                                                      │ │  Worker Autonomo   │
                                                      │ │  (worker-entry.js) │
                                                      │ │  ┌──────────────┐  │
                                                      │ │  │  Playwright   │  │
                                                      │ │  │  (Chromium)   │  │
                                                      │ │  └──────┬───────┘  │
                                                      │ └─────────┼──────────┘
                                                      │           │
                                                      │ ┌─────────▼───────────┐
                                                      │ │  Portal Oficial      │
                                                      │ │  Alcaldía de Pereira │
                                                      │ └─────────────────────┘
```

Ver diagrama completo con Mermaid en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Estructura del proyecto

```
pereira-te-escucha/
├── App.tsx                  # Entrada principal — UI, polling, lógica de envío
├── app.json                 # Configuración Expo (permisos, íconos, package)
├── eas.json                 # Perfiles de build EAS
├── docker-compose.yml       # Orquestación: Redis + PostgreSQL + api + worker
├── PRIVACY_POLICY.md        # Política de privacidad (Play Store)
├── assets/                  # Íconos y splash screen
├── src/
│   ├── components/          # 6 componentes de paso (StepEvidence, StepLocation, etc.)
│   ├── config/env.ts        # Variables de entorno de la app
│   ├── services/            # API, tracking, generación de carta
│   ├── types/               # Tipos TypeScript
│   ├── utils/               # Formateo y helpers
│   └── styles.ts            # Estilos globales y tema
├── backend/
│   ├── src/
│   │   ├── server.js        # API HTTP (Express)
│   │   ├── worker-entry.js  # Entry point del worker BullMQ
│   │   ├── worker.js        # Worker BullMQ (procesa jobs con Playwright)
│   │   ├── queue.js         # Cola BullMQ con backoff exponencial
│   │   ├── validation.js    # Validación y sanitización (Zod)
│   │   ├── pereiraAutomation.js  # Automatización del portal con Playwright
│   │   ├── db.js            # Conexión a PostgreSQL
│   │   ├── app.js           # Creación de la app Express
│   │   ├── config.js        # Config centralizada de env vars
│   │   ├── routes/          # Rutas Express (health, pqrs, index)
│   │   ├── services/        # BD services, logger, hash
│   │   └── middleware/      # Auth y error handler
│   ├── scripts/
│   │   └── local-setup.cjs  # [DEPRECATED] Usar docker compose
│   ├── Dockerfile.api       # Dockerfile para el contenedor api
│   ├── Dockerfile.worker    # Dockerfile para el contenedor worker
│   ├── .env.example
│   └── .dockerignore
└── docs/
    ├── ARCHITECTURE.md      # Diagrama + descripción con Redis/BullMQ
    ├── AUDIT.md             # Hallazgos de deuda técnica
    ├── PRIVACY_POLICY.md    # Política de privacidad (Play Store)
    ├── ROADMAP_PLAY_STORE.md
    ├── TERMS_OF_SERVICE.md
    └── USER_FLOW.md
```

---

## Setup local

### Requisitos

- **Node.js** ≥ 20
- **Docker** (para PostgreSQL + Redis)
- **Dispositivo físico** con Expo Dev Client o **Android Studio** con emulador

### 1. Instalar dependencias

```bash
npm install
cd backend && npm install && npx playwright install chromium
```

### 2. Variables de entorno

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

| Variable | Descripción |
|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | URL del backend desde el dispositivo (ej: `http://192.168.100.12:3001`) |
| `EXPO_PUBLIC_BACKEND_API_TOKEN` | Token opcional |
| `EXPO_PUBLIC_SUBMIT_TIMEOUT_MS` | Timeout de envío (ms) |
| `DATABASE_URL` | Conexión a PostgreSQL |
| `REDIS_URL` | Conexión a Redis (default `redis://127.0.0.1:6379`) |
| `PEREIRA_FORM_URL` | URL del formulario oficial |
| `PLAYWRIGHT_TIMEOUT_MS` | Timeout de radicación (ms) |
| `ALLOWED_ORIGIN` | CORS (**nunca `*` en producción**) |

### 3. Iniciar PostgreSQL + Redis

```bash
npm run dev:infra
# = docker compose up -d postgres redis
```

### 4. Iniciar backend

```bash
# Terminal 1 — API
npm run dev:api

# Terminal 2 — Worker (procesa los jobs)
npm run dev:worker

# O ambos en una terminal:
npm run dev:backend
```

### 5. Iniciar app en el celular

```bash
npm run app:dev:lan
```

Escaneá el QR con Expo Go o abrí con el dev client.

---

## Comandos de desarrollo

| Comando | Descripción |
|---------|-------------|
| `npm run dev:infra` | Levanta PostgreSQL + Redis en Docker |
| `npm run dev:backend` | API + Worker simultáneamente |
| `npm run dev:api` | Solo la API Express |
| `npm run dev:worker` | Solo el Worker (BullMQ + Playwright) |
| `npm run app:dev:lan` | Expo en modo LAN (recomendado) |
| `npm run app:dev:tunnel` | Expo por túnel Ngrok |
| `npm run dev` | API + app Expo (sin worker) |
| `npm run docker:up` | docker compose up -d (todo) |
| `npm run docker:down` | docker compose down |
| `npm run local:setup` | [DEPRECATED] Bootstrap legacy solo PostgreSQL |

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
| [`docs/TERMS_OF_SERVICE.md`](docs/TERMS_OF_SERVICE.md) | Términos de servicio |
| [`docs/ROADMAP_PLAY_STORE.md`](docs/ROADMAP_PLAY_STORE.md) | Checklist para publicación en Play Store |
| [`docs/USER_FLOW.md`](docs/USER_FLOW.md) | Flujo de usuario por la app |
| [`backend/README.md`](backend/README.md) | Setup y contrato técnico del backend |
| [`backend/INSPECCION_PEREIRA.md`](backend/INSPECCION_PEREIRA.md) | Análisis técnico del portal oficial de Pereira |

---

## Estado del proyecto

| Módulo | Estado |
|--------|--------|
| App móvil (UI + formulario) | ✅ Funcional |
| Backend API + validación | ✅ Funcional |
| Radicación con Playwright | ✅ Funcional |
| Seguimiento asíncrono | ✅ Funcional |
| Docker (Redis + PostgreSQL + api + worker) | ✅ Listo |
| Cola de trabajos BullMQ | ✅ Listo |
| Tests backend (45 tests) | ✅ 24 unit + 21 integración |
| Publicación Play Store | ⏳ Pendiente (subir a Google Console) |

---

## Contribuir

Este proyecto es un desarrollo con fines exploratorios y educativos. Si encontrás un bug o tenés una sugerencia, abrí un Issue. PRs bienvenidos con descripción clara del cambio.

---

## Licencia

MIT © 2026 Juan Andrés Rojas — ver [`LICENSE`](LICENSE) para detalles.

> **Aviso:** este proyecto no tiene afiliación oficial con la Alcaldía de Pereira. Automatiza el portal público de PQRD con fines académicos y de accesibilidad ciudadana.