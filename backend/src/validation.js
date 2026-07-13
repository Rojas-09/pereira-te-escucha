import path from 'node:path';
import { z } from 'zod';
import { ALLOWED_EXTENSIONS, MAX_FILES, MAX_FILE_SIZE_BYTES, MEDIO_RESPUESTA_LABEL, TIPO_SOLICITUD_LABEL, ALLOWED_MIME_TYPES, MAGIC_NUMBER_ALLOWED } from './constants.js';
import { fileTypeFromFile } from 'file-type';

// Sanitización contra XSS - elimina caracteres peligrosos
export function sanitizeText(input) {
  if (typeof input !== 'string') return '';

  let value = input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:/gi, '')
    .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ,.;:!¿?()\-@/#&'"\n]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/\s{3,}/g, '  ')
    .trim();

  return value;
}

const requestSchema = z.object({
  medioRespuesta: z.enum(['cartelera', 'correo_electronico', 'correo_fisico']),
  correo: z.string().email().optional().or(z.literal('')),
  tipoSolicitud: z.enum(['peticion', 'queja', 'reclamo', 'sugerencia', 'denuncia']),
  asunto: z.string().min(5).max(255).transform(sanitizeText),
  descripcion: z.string().min(1).transform(sanitizeText),
  aceptarTratamiento: z.preprocess(
    (val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return val;
    },
    z.literal(true, {
      errorMap: () => ({ message: 'aceptarTratamiento debe ser explícitamente true. Debes aceptar el tratamiento de datos personales.' })
    })
  )
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

export async function validateFiles(files = []) {
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
  for (const [index, file] of files.entries()) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      errors.push({
        path: `files.${index}`,
        message: `Extension no permitida (${ext || 'sin extension'})`
      });
      continue;
    }

    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      errors.push({
        path: `files.${index}`,
        message: `Tipo de archivo no permitido (${file.mimetype})`
      });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push({
        path: `files.${index}`,
        message: `El archivo ${file.originalname} supera 27 MB`
      });
    }

    if (file.originalname && (file.originalname.includes('..') || file.originalname.includes('/'))) {
      errors.push({
        path: `files.${index}`,
        message: `Nombre de archivo invalido`
      });
    }

    if (file.path) {
      try {
        const detectedType = await fileTypeFromFile(file.path);
        if (detectedType) {
          const allowedExts = MAGIC_NUMBER_ALLOWED.get(detectedType.mime);
          if (!allowedExts || !allowedExts.includes(ext)) {
            errors.push({
              path: `files.${index}`,
              message: `El contenido del archivo (${detectedType.mime}) no coincide con la extension declarada (${ext})`,
            });
          }
        } else {
          errors.push({
            path: `files.${index}`,
            message: `No fue posible reconocer el tipo real del archivo ${file.originalname}. El formato no esta soportado o el archivo esta corrupto.`,
          });
        }
      } catch (contentError) {
        errors.push({
          path: `files.${index}`,
          message: `No fue posible verificar el contenido del archivo: ${contentError.message}`,
        });
      }
    }
  }

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


