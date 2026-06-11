# Auditoria del estado actual

## Alcance

Este informe resume el estado actual del proyecto antes de cualquier refactor. Cubre la app Expo, el backend Node/Express, la automatizacion con Playwright, la configuracion local y los artefactos historicos de la raiz del repositorio.

## Deuda tecnica

### Alta

- `backend/src/server.js` concentra API HTTP, bootstrap de base de datos, worker interno, persistencia, manejo de errores y ciclo de procesamiento. Eso dificulta pruebas, mantenimiento y cambios aislados.
- `App.tsx` mezcla logica de resolucion de entorno, polling, construcción de contenido, UI y manejo de estado. El archivo crece como punto unico de control de la experiencia completa.

### Media

- `backend/src/pereiraAutomation.js` depende de selectores y comportamiento del portal externo; la logica esta acoplada a un sistema que puede cambiar sin previo aviso.
- Las pruebas en `backend/src/validation.test.js` cubren solo una parte pequena de la validacion. Faltan casos para tamano maximo, numero maximo de archivos, consentimiento y contratos de error.

## Inconsistencias

### Alta

- La app define un fallback de produccion en `App.tsx` hacia `https://api.pereira-pqrs.com`, pero el contrato real depende de `EXPO_PUBLIC_API_BASE_URL`. Si ese valor no se define, el cliente asume una URL que no esta documentada como obligatoria.
- La documentacion hablaba de la base documental, pero no exponia una lista explicita de hallazgos. Eso dejaba incompleto el paso 1.

### Media

- `backend/.env.example` usa `ALLOWED_ORIGIN=*` como valor por defecto. Es util para desarrollo, pero si se copia sin ajuste a otro entorno deja CORS abierto.
- `backend/scripts/local-setup.cjs` crea una credencial fija de PostgreSQL para desarrollo local. Sirve para bootstrap, pero es una convencion peligrosa si se reutiliza fuera del entorno local.
- `backend/src/validation.js` define `aceptarTratamiento` con default `true`, pero no lo hace obligatorio como consentimiento real. Eso puede ocultar una inconsistencia funcional entre formulario y validacion.

## Vulnerabilidades y riesgos

### Alta

- `backend/src/server.js` expone CORS con origen totalmente abierto cuando `ALLOWED_ORIGIN=*`. En produccion eso debe limitarse a orígenes concretos.
- La carga de anexos acepta archivos en disco temporal y luego los mueve al flujo de automatizacion. Aunque hay validaciones, el sistema depende de la extension, del MIME y del nombre original, que no sustituyen una inspeccion de contenido real.

### Media

- `sanitizeText` elimina ciertos patrones de HTML o JavaScript, pero no es una sanitizacion completa para cualquier contexto futuro de renderizado. Es una defensa parcial, no una garantia total.
- El worker automatiza un portal externo con Playwright y asume estabilidad de selectores y respuesta HTTP. Eso introduce fragilidad operacional y riesgo de fallos silenciosos ante cambios externos.

### Baja

- La informacion de estado depende de un `trackingCode` generado en backend. La seguridad funcional es razonable para consulta, pero conviene revisar la exposicion publica del endpoint si el producto crece.

## Lectura ejecutiva

El proyecto ya tiene una base funcional clara, pero el paso 1 no puede considerarse completo sin explicitar estos hallazgos. El principal problema tecnico es la concentracion de responsabilidades en `server.js` y la dependencia fuerte del portal externo. La principal inconsistencia operativa es la mezcla entre configuracion documentada y valores por defecto que pueden llevar a despliegues inseguros si no se sobrescriben.

## Siguiente paso sugerido

Con esta auditoria se puede pasar a una reingenieria controlada: separar responsabilidades del backend, endurecer configuracion y ampliar pruebas alrededor de validacion y automatizacion.
