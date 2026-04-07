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

Luego inicia el backend con:

```bash
npm run local:backend
```

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

Campos form-data:

- `medioRespuesta`: `cartelera | correo_electronico | correo_fisico`
- `correo`: requerido si `medioRespuesta=correo_electronico`
- `tipoSolicitud`: `peticion | queja | reclamo | sugerencia | denuncia`
- `asunto`
- `descripcion`
- `aceptarTratamiento`: `true|false`
- `files`: archivos opcionales (0..10)

Respuesta esperada:

```json
{
  "ok": true,
  "data": {
    "consecutive": "11878",
    "radicado": "20260318-11878-E",
    "title": "Numero Consecutivo: 11878",
    "messageBody": "Su solicitud ha sido generada..."
  }
}
```

## Notas operativas

- Este backend usa Playwright para controlar el formulario real.
- Si el sitio cambia selectores o reglas, hay que actualizar `src/pereiraAutomation.js`.
- En emulador Android, la app React Native usa `http://10.0.2.2:3001` para llegar al backend local.
