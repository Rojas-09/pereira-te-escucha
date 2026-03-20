import path from 'node:path';
import { z } from 'zod';
import { ALLOWED_EXTENSIONS, MAX_FILES, MAX_FILE_SIZE_BYTES, MEDIO_RESPUESTA_LABEL, TIPO_SOLICITUD_LABEL } from './constants.js';

const requestSchema = z.object({
  medioRespuesta: z.enum(['cartelera', 'correo_electronico', 'correo_fisico']),
  correo: z.string().email().optional().or(z.literal('')),
  tipoSolicitud: z.enum(['peticion', 'queja', 'reclamo', 'sugerencia', 'denuncia']),
  asunto: z.string().min(5).max(255),
  descripcion: z.string().min(20),
  aceptarTratamiento: z.coerce.boolean().default(true)
});

export function validateBody(input) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message
      }))
    };
  }

  const data = parsed.data;
  if (data.medioRespuesta === 'correo_electronico' && !data.correo) {
    return {
      ok: false,
      errors: [{ path: 'correo', message: 'correo es obligatorio cuando medioRespuesta es correo_electronico' }]
    };
  }

  return { ok: true, data };
}

export function validateFiles(files = []) {
  if (!Array.isArray(files)) {
    return { ok: false, errors: [{ path: 'files', message: 'files debe ser un arreglo' }] };
  }

  if (files.length > MAX_FILES) {
    return {
      ok: false,
      errors: [{ path: 'files', message: `Solo se permiten ${MAX_FILES} archivos` }]
    };
  }

  const errors = [];
  files.forEach((file, index) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      errors.push({
        path: `files.${index}`,
        message: `Extension no permitida (${ext || 'sin extension'})`
      });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push({
        path: `files.${index}`,
        message: `El archivo ${file.originalname} supera 27 MB`
      });
    }
  });

  if (errors.length) {
    return { ok: false, errors };
  }

  return { ok: true };
}

export function mapToHumanValues(data) {
  return {
    ...data,
    medioRespuestaLabel: MEDIO_RESPUESTA_LABEL[data.medioRespuesta],
    tipoSolicitudLabel: TIPO_SOLICITUD_LABEL[data.tipoSolicitud]
  };
}
