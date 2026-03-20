# Inspeccion tecnica - https://doc.pereira.gov.co/ws/pqr/index.html

## Hallazgos clave

- El formulario usa autenticacion de WS token interno:
  - `GET /api/public/generateWsToken`
- El guardado principal usa captcha + endpoint:
  - `POST /api/pqr/captcha/saveDocument`
- Tiene recaptcha v3 en cliente (`grecaptcha.execute`).
- El modo anonimo existe por checkbox `#sys_anonimo`.

## Reglas de campos (segun JS oficial)

Script analizado: `index.js` del sitio.

### Con anonimo activado

`fieldsWithAnonymous` define:

- Obligatorios: `medio_de_respue`, `sys_tipo`, `asunto`, `descripci_n`.
- `sys_email` visible pero no obligatorio por defecto de la pagina.
- `sys_anexos` opcional.
- `sys_tratamiento` visible, no obligatorio en ese arreglo.

### Sin anonimo

`fieldsWithoutAnonymous` define obligatorios adicionales:

- tipo solicitante, nombres, apellidos, tipo y numero de documento, zona, terminos.

## Reglas de anexos en cliente

Configuracion Dropzone en sitio:

- `maxFiles: 10`
- `acceptedFiles`: incluye documentos e imagenes.
- Mensaje visual del portal: 27 MB por archivo.

## Endpoints observados

- `GET /api/public/generateWsToken`
- `GET /api/pqr/components/autocomplete/list`
- `POST /api/temporal/file`
- `POST /api/pqr/captcha/saveDocument`
- `GET /api/pqr/searchByNumber`

## Implicacion para Fase 2

- La app movil no necesita autenticacion propia.
- La radicacion anonima puede orquestarse desde backend.
- La captura de radicado debe salir del mensaje de respuesta mostrado por el sitio.
