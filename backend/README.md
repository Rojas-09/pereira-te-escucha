# Backend - Radicacion Anonima Pereira

Backend Node.js para radicar PQRSD anonimas en el formulario oficial de Pereira mediante automatizacion web.

## Lo que valida

- Modo anonimo.
- Campos clave: medio de respuesta, tipo de solicitud, asunto, descripcion.
- Reglas de anexos oficiales:
  - Maximo 10 archivos.
  - Maximo 27 MB por archivo.
  - Tipos permitidos: XLS, DOC, PDF, JPG, JPEG, XLSX, DOCX, PNG, TIFF, TIF, GIF, PPT, PPTX.

## Arquitectura

```
App Expo ──multipart──▶ API (server.js) ──INSERT DB──▶ PostgreSQL
                            │                              ▲
                            ▼                              │
                      Redis/BullMQ ──job──▶ Worker (worker-entry.js)
                                               │
                                               ▼
                                         Playwright ──▶ Portal Pereira
```

La API recibe la solicitud, la persiste en PostgreSQL y **encola un job en Redis via BullMQ**. El worker consume jobs de la cola, ejecuta Playwright y actualiza el estado en PostgreSQL.

### Procesos

| Proceso | Entry point | Funcion |
|---------|------------|---------|
| API | `src/server.js` | Endpoints HTTP, validacion, persistencia |
| Worker | `src/worker-entry.js` | Consume cola BullMQ, ejecuta Playwright |

### Cola de trabajos

- `src/queue.js`: cola BullMQ con backoff exponencial y reintentos.
- `src/worker.js`: Worker de BullMQ que procesa cada job.
- El estado (`jobState`) se deriva de `requests.status` via CASE - no hay tabla `automation_jobs`.

## Requisitos

- Node.js >= 20
- Docker (para PostgreSQL + Redis en desarrollo)

## Variables de entorno

Copia `.env.example` a `.env`.

### Compartidas (api + worker)

- `DATABASE_URL`: conexion PostgreSQL.
- `REDIS_URL`: conexion Redis (default `redis://127.0.0.1:6379`).
- `NODE_ENV`: `development` | `production`.

### Solo API

- `PORT`: puerto (default 3001).
- `ALLOWED_ORIGIN`: CORS (nunca `*` en produccion).
- `BACKEND_API_TOKEN`: obligatorio en produccion.
- `SENTRY_DSN`: DSN de Sentry.

### Solo Worker

- `PEREIRA_FORM_URL`: URL del formulario oficial.
- `PLAYWRIGHT_HEADLESS`: `true|false`.
- `PLAYWRIGHT_TIMEOUT_MS`: timeout por radicacion.

## Instalacion

```bash
cd backend
npm install
npx playwright install chromium
```

## Ejecucion (desarrollo)

### 1. Infraestructura (PostgreSQL + Redis)

```bash
# Desde la raiz del proyecto:
npm run dev:infra
# (= docker compose up -d postgres redis)
```

### 2. Backend

```bash
# Solo API
npm run dev

# Solo Worker (otra terminal)
npm run worker

# O ambos a la vez (desde la raiz):
npm run dev:backend
```

### 3. App (otra terminal)

```bash
npm run app:dev:lan
```

## Despliegue con Docker (produccion)

```bash
docker compose up -d
```

Levanta 4 contenedores:
- `redis`: Redis 7 Alpine.
- `postgres`: PostgreSQL 16 Alpine.
- `api`: backend Express.
- `worker`: worker con Playwright + Chromium.

## Validacion de esquema al arranque

Al iniciar, valida que existan las tablas:
- `requests`
- `request_status_events`
- `request_attachments`

## Pruebas

```bash
npm test
```

Healthcheck:

```bash
GET /health
GET /health/playwright
```

## Endpoint principal

```bash
POST /api/pqrs/submit-anonymous
Content-Type: multipart/form-data
```

Campos:

- `medioRespuesta`: `cartelera | correo_electronico | correo_fisico`
- `correo`: requerido si `medioRespuesta=correo_electronico`
- `tipoSolicitud`: `peticion | queja | reclamo | sugerencia | denuncia`
- `asunto`
- `descripcion`
- `aceptarTratamiento`: `true|false`
- `files`: archivos opcionales (0..10)

Respuesta (202):

```json
{
  "ok": true,
  "code": "ACCEPTED",
  "data": {
    "requestId": 123,
    "trackingCode": "PETE-20260407195500-4821",
    "status": "recibido",
    "jobState": "pending",
    "statusUrl": "/api/pqrs/status/PETE-20260407195500-4821",
    "pollAfterMs": 5000,
    "acceptedAt": "2026-04-07T19:55:00.000Z"
  }
}
```

Consulta de estado:

```bash
GET /api/pqrs/status/:trackingCode
```

## Notas operativas

- Playwright controla el formulario real del portal de Pereira.
- Si el sitio cambia selectores, hay que actualizar `src/pereiraAutomation.js`.
- En emulador Android, la app usa `http://10.0.2.2:3001`.
- Redis debe estar corriendo para que el worker funcione.
