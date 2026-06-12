export const ALLOWED_EXTENSIONS = new Set([
  '.xls',
  '.doc',
  '.pdf',
  '.jpg',
  '.jpeg',
  '.xlsx',
  '.docx',
  '.png',
  '.tiff',
  '.tif',
  '.gif',
  '.ppt',
  '.pptx'
]);

// MIME types permitidos para validación adicional
export const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.ms-excel', // .xls
  'application/msword', // .doc
  'application/pdf', // .pdf
  'image/jpeg', // .jpg, .jpeg
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'image/png', // .png
  'image/tiff', // .tiff, .tif
  'image/gif', // .gif
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
]);

export const MAX_FILES = 10;
export const MAX_FILE_SIZE_BYTES = 27 * 1024 * 1024;

export const MAGIC_NUMBER_ALLOWED = new Map([
  ['application/pdf', ['.pdf']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/tiff', ['.tif', '.tiff']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['.xlsx']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', ['.pptx']],
  ['application/vnd.ms-excel', ['.xls']],
  ['application/msword', ['.doc']],
  ['application/vnd.ms-powerpoint', ['.ppt']],
]);

export const MEDIO_RESPUESTA_LABEL = {
  cartelera: 'Publicacion en cartelera institucional',
  correo_electronico: 'Correo electronico',
  correo_fisico: 'Correo fisico'
};

export const TIPO_SOLICITUD_LABEL = {
  peticion: 'Peticion',
  queja: 'Queja',
  reclamo: 'Reclamo',
  sugerencia: 'Sugerencia',
  denuncia: 'Denuncia'
};
