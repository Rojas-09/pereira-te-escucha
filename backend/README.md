# Backend Fase 2 - Radicacion Anonima Pereira

Backend Node.js para radicar PQRSD anonimas en el formulario oficial de Pereira mediante automatizacion web.

## Lo que valida

- Modo anonimo.
- Campos clave: medio de respuesta, tipo de solicitud, asunto, descripcion.
- Reglas de anexos oficiales:
  - Maximo 10 archivos.
  - Maximo 27 MB por archivo.
  - Tipos permitidos: XLS, DOC, PDF, JPG, JPEG, XLSX, DOCX, PNG, TIFF, TIF, GIF, PPT, PPTX.

## Variables de entorno

Copia `.env.example` a `.env`.

- `PORT`: puerto del backend (default 3001).
- `DATABASE_URL`: cadena de conexion PostgreSQL (obligatoria).
- `ALLOWED_ORIGIN`: origen permitido para CORS (`*` para desarrollo).
- `PEREIRA_FORM_URL`: URL del formulario publico.
- `PLAYWRIGHT_HEADLESS`: `true|false`.
- `PLAYWRIGHT_TIMEOUT_MS`: timeout total por radicacion.
- `WORKER_ENABLED`: activa/desactiva el worker interno (`true|false`).
- `WORKER_POLL_MS`: intervalo de sondeo de jobs pendientes.

## Instalacion

```bash
cd backend
npm install
npx playwright install chromium
```

## Ejecucion

```bash
npm run dev
```

## Flujo local rapido (Windows + Docker)

Desde la raiz de `pq-ia-app`:

```bash
npm run local:setup
```

Este comando automatiza:

- Levantar PostgreSQL en Docker.
- Crear base de datos y esquema minimo requerido.
- Crear `backend/.env` desde `backend/.env.example`.
- Validar conexion a base de datos.

Scripts involucrados (desde la raiz):

- `backend/package.json` (scripts `local:setup` y `dev`)

Luego inicia el backend con:

```bash
npm run local:backend
```

## Validacion de esquema al arranque

Al iniciar, el backend valida que exista el esquema minimo requerido:

- `requests`
- `request_status_events`
- `request_attachments`
- `automation_jobs`

Si falta una tabla o `automation_jobs.request_id` no tiene restriccion `UNIQUE`/`PRIMARY KEY`, el proceso termina con un error explicito para evitar fallos en runtime.

## Pruebas

```bash
npm test
```

Healthcheck:

```bash
GET /health
```

## Endpoint principal

```bash
POST /api/pqrs/submit-anonymous
Content-Type: multipart/form-data
```

Este endpoint es asincrono: valida y encola la solicitud, y responde de inmediato con codigo de seguimiento.

Campos form-data:

- `medioRespuesta`: `cartelera | correo_electronico | correo_fisico`
- `correo`: requerido si `medioRespuesta=correo_electronico`
- `tipoSolicitud`: `peticion | queja | reclamo | sugerencia | denuncia`
- `asunto`
- `descripcion`
- `aceptarTratamiento`: `true|false`
- `files`: archivos opcionales (0..10)

Respuesta esperada (202 Accepted):

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

La radicacion oficial (consecutivo/radicado) se consulta despues en:

```bash
GET /api/pqrs/status/:trackingCode
```

## Notas operativas

- Este backend usa Playwright para controlar el formulario real.
- Si el sitio cambia selectores o reglas, hay que actualizar `src/pereiraAutomation.js`.
- En emulador Android, la app React Native usa `http://10.0.2.2:3001` para llegar al backend local.
