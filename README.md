# Pereira Te Escucha

Aplicacion movil para registrar solicitudes ciudadanas (peticiones, quejas, reclamos, sugerencias y denuncias) de forma simple.

## Que hace esta app

- Permite llenar y enviar una solicitud desde el celular.
- Permite adjuntar evidencias (como fotos o archivos).
- Permite usar ubicacion para ubicar el punto del reporte.
- Se conecta con un backend que procesa y radica la solicitud.
- El envio es asincrono: primero entrega codigo de seguimiento y luego actualiza el estado de radicacion.

## Para quien esta pensada

Este proyecto esta escrito para dos tipos de uso:

1. Uso funcional: personas que solo quieren entender para que sirve.
2. Uso tecnico: equipo que necesita ejecutar la app y el backend en desarrollo.

## Setup

### Requisitos basicos

- Node.js instalado.
- Docker Desktop instalado (para base de datos local).
- Android Studio con emulador (si se probara en Android).

### Arranque local

Desde la carpeta `pq-ia-app`:

```bash
npm run local:setup
```

Este comando prepara automaticamente:

- Base de datos PostgreSQL local en Docker.
- Esquema minimo de tablas del backend.
- Archivo de entorno del backend.

Luego iniciar backend:

```bash
npm run local:backend
```

En otra terminal, iniciar la app:

```bash
npm run app:dev
```

Opcionales para desarrollo movil:

- `npm run app:dev:tunnel`: expone la app por tunnel.
- `npm run app:dev:lan`: usa red local como fallback.
- `npm run app:dev:win`: ejecuta `adb reverse` y luego `LAN` en Windows.

## Arquitectura

La app esta dividida en dos superficies activas:

- `App.tsx`: cliente Expo/React Native que captura la solicitud, adjuntos y ubicacion.
- `backend/`: API Node/Express que valida, persiste y automatiza la radicacion.

Flujo principal de datos:

1. La app resuelve la URL del backend desde `EXPO_PUBLIC_API_BASE_URL`.
2. El usuario completa la solicitud y la app envía `multipart/form-data` al backend.
3. El backend valida el payload, guarda la solicitud en PostgreSQL y encola un job.
4. El worker interno toma el job y usa Playwright para radicar en el portal oficial.
5. La app consulta el estado por `trackingCode` hasta obtener el consecutivo o radicado final.

Ver diagrama completo en [ARCHITECTURE.md](ARCHITECTURE.md).

## Flujos principales

### 1. Envio de solicitud

1. La app resuelve la URL del backend desde `EXPO_PUBLIC_API_BASE_URL` o usa el fallback de desarrollo.
2. El usuario completa el formulario, adjunta evidencias y envía `multipart/form-data`.
3. El backend valida el payload, limita anexos y persiste la solicitud en PostgreSQL.
4. La API responde con `trackingCode` y un `statusUrl` para seguimiento asincrono.

### 2. Radicacion en segundo plano

1. El worker interno toma el job pendiente.
2. Playwright controla el formulario oficial de Pereira.
3. El backend guarda consecutivo, radicado, mensaje del portal y eventos de estado.

### 3. Seguimiento del estado

1. La app consulta `GET /api/pqrs/status/:trackingCode`.
2. El backend devuelve el estado actual y el historial de eventos.
3. La app mantiene el polling hasta recibir radicado final o error.

## Variables de entorno

Los contratos de configuracion estan documentados en:

- [pq-ia-app/.env.example](.env.example)
- [pq-ia-app/backend/.env.example](backend/.env.example)

Puntos clave:

- `EXPO_PUBLIC_API_BASE_URL`: URL del backend accesible desde el dispositivo.
- `EXPO_PUBLIC_BACKEND_API_TOKEN`: token opcional si el backend tiene autenticacion activada.
- `EXPO_PUBLIC_SUBMIT_TIMEOUT_MS`: tiempo maximo para la radicacion desde la app.
- `DATABASE_URL`: conexion obligatoria a PostgreSQL para el backend.
- `PEREIRA_FORM_URL`: formulario oficial usado por Playwright.
- `PLAYWRIGHT_TIMEOUT_MS`: tiempo maximo del proceso de radicacion.

## Comandos importantes

- `npm run local:setup`: prepara entorno local completo.
- `npm run local:setup:fast`: version rapida (sin reinstalar dependencias).
- `npm run local:backend`: inicia solo backend.
- `npm run dev`: inicia backend + app al mismo tiempo.
- `npm run app:dev`: inicia Expo para development build.
- `npm run app:dev:lan`: inicia Expo en modo LAN (fallback recomendado cuando falla tunnel).
- `npm run app:dev:tunnel`: inicia Expo en modo tunnel (Ngrok).
- `npm run app:dev:win`: ejecuta `adb reverse` + LAN para pruebas en Android por USB.

## Versionado de release

- `app.json` (`expo.version`) define la version visible al usuario.
- `package.json` (`version`) se mantiene alineado con la version de release.
- `eas.json` usa `appVersionSource: remote`, por lo que EAS maneja internamente el build number para Play Store.
- Antes de publicar, incrementar `expo.version` y `package.json.version` en el mismo cambio.

## Cleartext en Android (solo desarrollo)

- El plugin `plugins/withAndroidCleartextTraffic.js` queda activo en `app.json`.
- Permite HTTP en perfiles `development` y `preview`.
- En `production` queda deshabilitado por defecto.
- Para casos locales sin perfil EAS, usar `EXPO_PUBLIC_ALLOW_CLEARTEXT=true` solo mientras se prueban endpoints HTTP locales.

## Variables de entorno de app (Expo)

- `EXPO_PUBLIC_API_BASE_URL`: URL del backend accesible desde el dispositivo.
- `EXPO_PUBLIC_SUBMIT_TIMEOUT_MS`: tiempo maximo de espera al radicar (en ms). Recomendado: mayor que `PLAYWRIGHT_TIMEOUT_MS` del backend.

## Si falla al abrir en Android

- Si aparece error de emulador no encontrado: crear/iniciar un emulador en Android Studio.
- Si aparece error de Expo Go por SDK: usar development build (no Expo Go).
- Si falla un build de EAS: revisar logs de la fase `Prepare project`.

## Estructura general del proyecto

- `App.tsx`: interfaz principal de la app movil.
- `backend/`: API para validar, guardar y procesar solicitudes.
- `plugins/`: ajustes nativos de Expo/Android.
- `assets/`: imagenes y recursos visuales.

## Documentos utiles

- [ARCHITECTURE.md](ARCHITECTURE.md): componentes, flujo de datos y dependencias.
- [AUDIT.md](AUDIT.md): hallazgos de deuda tecnica, inconsistencias y vulnerabilidades.
- `backend/README.md`: setup y contrato tecnico del backend.
- `PRIVACY_POLICY.md`: politica de privacidad.
- `ROADMAP_PLAY_STORE.md`: pendientes para publicacion.

## Artefactos raiz historicos

Estos archivos existen en la raiz del repositorio y forman parte de la superficie historica del portal, no de la app Expo actual:

- `index-pereira.html`
- `pereira-index.js`
- `pereira-define.js`

## Nota

Este proyecto esta en evolucion. Si algo no funciona a la primera, revisar logs y ejecutar los comandos de inicio rapido en el orden indicado.
