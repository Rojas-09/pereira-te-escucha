# Arquitectura del proyecto

## Componentes

- `App.tsx`: entrada principal de la app movil — delega UI en componentes modulares.
- `src/components/`: 6 componentes de paso (`AppNotice`, `StepEvidence`, `StepLocation`, `StepMessage`, `StepReview`, `StepStatus`).
- `src/styles.ts`: estilos globales y tema.
- `backend/src/server.js`: API HTTP, validacion de arranque.
- `backend/src/worker-entry.js`: entry point separado del worker de automatizacion (BullMQ).
- `backend/src/worker.js`: worker que consume jobs de BullMQ y ejecuta Playwright.
- `backend/src/queue.js`: cola BullMQ con backoff exponencial y reintentos.
- `backend/src/validation.js`: validacion y saneamiento de los datos de entrada (Zod).
- `backend/src/pereiraAutomation.js`: automatizacion del portal externo con Playwright.
- `backend/src/db.js`: conexion a PostgreSQL (pool).
- `backend/src/routes/health.js`: healthcheck de API, base de datos y Playwright.
- `docker-compose.yml`: orquestacion con Redis, PostgreSQL, API y Worker.

## Flujo de datos

```mermaid
flowchart LR
  U[Usuario] --> A[App Expo]
  A -->|multipart/form-data| B[Backend Express<br/>server.js]
  B --> V[Validacion<br/>validation.js]
  V --> D[(PostgreSQL<br/>db.js)]
  B --> Q[Redis / BullMQ<br/>queue.js]
  Q --> W[Worker autonomo<br/>worker-entry.js]
  W --> P[Playwright<br/>pereiraAutomation.js]
  P --> O[Portal oficial de Pereira]
  A -->|trackingCode| S[GET /api/pqrs/status/:trackingCode]
  S --> D
  subgraph api_container [Contenedor api]
    B
    V
  end
  subgraph worker_container [Contenedor worker]
    W
    P
  end
```

## Lectura del flujo

1. La app resuelve la URL del backend desde las variables `EXPO_PUBLIC_*`.
2. El usuario llena la solicitud (multi-paso en `src/components/`), adjunta archivos y envia el formulario.
3. El backend valida campos, limite de archivos, tipos permitidos y persiste la solicitud en PostgreSQL.
4. La API encola un job en Redis/BullMQ (`queue.js`).
5. El worker (`worker-entry.js`) consume el job, ejecuta Playwright y actualiza el estado en PostgreSQL.
6. La app consulta el estado por `trackingCode` hasta recibir consecutivo, radicado o error.

## Cola de trabajos (Redis + BullMQ)

La API ya no escribe en la tabla `automation_jobs`. En su lugar:

- `request.service.js` llama a `getQueue().add('submit', { requestId })`
- `queue.js` configura BullMQ con backoff exponencial y maximo de reintentos
- `worker.js` escucha jobs como Worker de BullMQ y procesa con Playwright
- El estado (`jobState`) se deriva directamente de `requests.status` via CASE

## Despliegue con Docker

```bash
docker compose up -d
```

Levanta **cuatro** servicios independientes:
- **redis**: Redis 7 Alpine — cola de trabajos BullMQ.
- **postgres**: base de datos PostgreSQL 16.
- **api**: backend Express (`Dockerfile.api`) — solo sirve HTTP y valida.
- **worker**: worker de automatizacion (`Dockerfile.worker`) — solo ejecuta Playwright.

### Desarrollo local (sin Docker para api/worker)

```bash
# Infraestructura (PostgreSQL + Redis)
npm run dev:infra

# Terminal 1 — API
npm run dev:api

# Terminal 2 — Worker
npm run dev:worker

# O ambas a la vez:
npm run dev:backend
```

## Configuracion

Frontend:

- `.env.example` (raiz del proyecto)

Backend:

- `backend/.env.example`

## Superficie historica

Los archivos raiz `index-pereira.html`, `pereira-index.js` y `pereira-define.js` describen una superficie anterior del portal de Pereira. No forman parte del flujo activo de la app Expo, pero sirven como contexto tecnico para entender la automatizacion y las referencias antiguas del sitio.