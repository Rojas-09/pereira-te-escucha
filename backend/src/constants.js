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

export const MAX_FILES = 10;
export const MAX_FILE_SIZE_BYTES = 27 * 1024 * 1024;

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
