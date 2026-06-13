import { LocationPoint, PersonalData } from '../types';

const PQRD_TYPES = ['Peticion', 'Queja', 'Reclamo', 'Sugerencia', 'Denuncia'];

export function formalizeContext(input: string): string {
  const sanitized = input
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim();

  const typoFixes: Array<[RegExp, string]> = [
    [/\bvaches\b/gi, 'baches'],
    [/\bbacheses\b/gi, 'baches'],
    [/\bestaa\b/gi, 'esta'],
    [/\bestta\b/gi, 'esta'],
    [/\bmui\b/gi, 'muy'],
    [/\baveriaa\b/gi, 'averia'],
    [/\bbasurra\b/gi, 'basura'],
  ];

  let corrected = sanitized;
  typoFixes.forEach(([pattern, value]) => {
    corrected = corrected.replace(pattern, value);
  });

  const normalized = corrected
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const sentences = corrected
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const normalizeSentence = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const pickSentencesByKeywords = (keywords: string[], limit = 2) => {
    const selected = sentences.filter((sentence) => {
      const n = normalizeSentence(sentence);
      return keywords.some((keyword) => n.includes(keyword));
    });
    return Array.from(new Set(selected)).slice(0, limit);
  };

  const intents = [
    {
      key: 'malla_vial',
      keywords: ['hueco', 'huecos', 'bache', 'baches', 'vial', 'calle', 'via', 'pavimento', 'asfalto'],
      finding: 'se identifica un presunto deterioro de la malla vial, con presencia de irregularidades en la superficie de rodadura',
      impact: 'esta condicion puede incrementar el riesgo de accidentes y afectar la movilidad de vehiculos, motociclistas, ciclistas y peatones',
      action: 'una inspeccion tecnica y la programacion de intervencion de mantenimiento vial',
    },
    {
      key: 'residuos',
      keywords: ['basura', 'residuo', 'residuos', 'escombro', 'escombros', 'mal olor', 'huele feo'],
      finding: 'se evidencia acumulacion de residuos solidos en el sector reportado',
      impact: 'esta situacion puede generar riesgos sanitarios, proliferacion de vectores y deterioro del espacio publico',
      action: 'verificacion en terreno y acciones de limpieza y control correspondientes',
    },
    {
      key: 'inundacion',
      keywords: ['inunda', 'inundacion', 'alcantarilla', 'drenaje', 'agua estancada'],
      finding: 'se reportan eventos recurrentes de encharcamiento e inundacion',
      impact: 'la situacion afecta la seguridad de la comunidad y la transitabilidad del sector, especialmente en temporada de lluvia',
      action: 'evaluacion tecnica de drenaje y medidas de mitigacion',
    },
    {
      key: 'alumbrado',
      keywords: ['luz', 'alumbrado', 'oscuro', 'lampara', 'poste'],
      finding: 'se reportan fallas en el servicio de alumbrado publico',
      impact: 'la falta de iluminacion incrementa la percepcion de inseguridad y limita el uso seguro del espacio publico',
      action: 'revision de luminarias y restablecimiento del servicio',
    },
    {
      key: 'general',
      keywords: [],
      finding: 'se reporta una situacion que requiere verificacion por parte de la administracion municipal',
      impact: 'la novedad descrita podria afectar las condiciones de bienestar de la comunidad del sector',
      action: 'inspeccion y acciones correctivas conforme a la competencia de la entidad',
    },
  ] as const;

  const selectedIntent = intents
    .map((intent) => {
      const score = intent.keywords.reduce((count, keyword) => {
        return normalized.includes(keyword) ? count + 1 : count;
      }, 0);
      return { intent, score };
    })
    .sort((a, b) => b.score - a.score)[0];

  const intent = selectedIntent && selectedIntent.score > 0 ? selectedIntent.intent : intents[intents.length - 1];

  const locationDetails = pickSentencesByKeywords(
    ['barrio', 'sector', 'calle', 'carrera', 'avenida', 'comuna', 'vereda', 'frente', 'esquina', 'puente'],
    1
  );

  const impactDetails = pickSentencesByKeywords(
    ['riesgo', 'accidente', 'inseguridad', 'tranco', 'trafico', 'movilidad', 'salud', 'olor', 'peligro', 'afecta'],
    2
  );

  const requestDetails = pickSentencesByKeywords(
    ['solicito', 'solicitamos', 'pido', 'pedimos', 'repar', 'interven', 'limpieza', 'inspeccion', 'arreg'],
    2
  );

  const evidenceDetails = pickSentencesByKeywords(
    ['siempre', 'todos los dias', 'desde', 'hace', 'cuando llueve', 'frecuente', 'recurrente'],
    1
  );

  const factualSentences = Array.from(
    new Set([...locationDetails, ...impactDetails, ...requestDetails, ...evidenceDetails])
  );

  const factualBlock =
    factualSentences.length > 0
      ? `En particular, el ciudadano reporta que: ${factualSentences
          .map((item) => item.replace(/[.!?]+$/g, '').trim())
          .join('; ')}.`
      : `En particular, se describe la siguiente situacion: ${corrected.replace(/[.!?]+$/g, '')}.`;

  return [
    `De acuerdo con el reporte ciudadano, ${intent.finding}.`,
    factualBlock,
    `${intent.impact}.`,
    `Por lo anterior, se solicita ${intent.action}, con prioridad y dentro de los terminos legales aplicables.`,
  ].join(' ');
}

export function buildFormalLetter(args: {
  type: string;
  informalContext: string;
  personalData: PersonalData;
  point: LocationPoint | null;
}): string {
  const dateText = new Date().toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const locationText = args.point
    ? `ubicada en las coordenadas (${args.point.latitude.toFixed(6)}, ${args.point.longitude.toFixed(6)})`
    : 'descrita por el ciudadano';

  const rewrittenContext = formalizeContext(args.informalContext);

  return `Pereira, ${dateText}

Señores
Oficina de Atención al Ciudadano
Alcaldía de Pereira

Asunto: Radicación de ${args.type.toLowerCase()} ciudadana

Yo, ${args.personalData.fullName || 'ciudadano(a) solicitante'}, identificado(a) con documento ${args.personalData.idNumber || 'sin registrar'}, presento respetuosamente la siguiente ${args.type.toLowerCase()} relacionada con una situación ${locationText}.

Descripción de los hechos:
${rewrittenContext}

Solicito se adelante el trámite correspondiente, se evalúe la situación reportada y se me informe el resultado por los canales de contacto suministrados.

Datos de contacto:
- Correo electrónico: ${args.personalData.email || 'sin registrar'}
- Teléfono: ${args.personalData.phone || 'sin registrar'}

Agradezco la atención prestada y quedo atento(a) a la respuesta oficial.

Cordialmente,

${args.personalData.fullName || 'Ciudadano(a)'}`;
}

export { PQRD_TYPES };
