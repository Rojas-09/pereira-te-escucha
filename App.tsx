import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { MapPressEvent, Marker, Region } from 'react-native-maps';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useFonts, Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';

const PQRD_TYPES = ['Peticion', 'Queja', 'Reclamo', 'Denuncia', 'Sugerencia'];
const TOTAL_STEPS = 5;

type LocationPoint = {
  latitude: number;
  longitude: number;
};

type PersonalData = {
  fullName: string;
  idNumber: string;
  email: string;
  phone: string;
};

type ResponseMedium = 'cartelera' | 'correo_electronico' | 'correo_fisico';
type SubmitStageStatus = 'pending' | 'active' | 'done';

type TrackingEvent = {
  to_status: string;
  reason: string | null;
  detail: string | null;
  created_at: string;
};

type TrackingSnapshot = {
  trackingCode: string;
  status: string;
  consecutivoOficial?: string | null;
  radicadoOficial?: string | null;
  portalMessage?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  events: TrackingEvent[];
};

const API_BASE_URL = 'http://10.0.2.2:3001';

async function fetchWithTimeout(resource: string, options: RequestInit, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function formalizeContext(input: string) {
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
      finding:
        'se identifica un presunto deterioro de la malla vial, con presencia de irregularidades en la superficie de rodadura',
      impact:
        'esta condicion puede incrementar el riesgo de accidentes y afectar la movilidad de vehiculos, motociclistas, ciclistas y peatones',
      action:
        'una inspeccion tecnica y la programacion de intervencion de mantenimiento vial',
    },
    {
      key: 'residuos',
      keywords: ['basura', 'residuo', 'residuos', 'escombro', 'escombros', 'mal olor', 'huele feo'],
      finding: 'se evidencia acumulacion de residuos solidos en el sector reportado',
      impact:
        'esta situacion puede generar riesgos sanitarios, proliferacion de vectores y deterioro del espacio publico',
      action: 'verificacion en terreno y acciones de limpieza y control correspondientes',
    },
    {
      key: 'inundacion',
      keywords: ['inunda', 'inundacion', 'alcantarilla', 'drenaje', 'agua estancada'],
      finding: 'se reportan eventos recurrentes de encharcamiento e inundacion',
      impact:
        'la situacion afecta la seguridad de la comunidad y la transitabilidad del sector, especialmente en temporada de lluvia',
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

function formatAddressFromReverseGeocode(result: Location.LocationGeocodedAddress | null) {
  if (!result) {
    return 'Direccion no disponible para este punto.';
  }

  const parts = [result.street, result.streetNumber, result.district, result.city, result.region]
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();

  return parts || 'Direccion no disponible para este punto.';
}

function buildFormalLetter(args: {
  type: string;
  informalContext: string;
  personalData: PersonalData;
  point: LocationPoint | null;
}) {
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

function generateRadicado(type: string) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomCode = Math.floor(100000 + Math.random() * 900000);
  return `PQR-${type.slice(0, 3).toUpperCase()}-${stamp}-${randomCode}`;
}

function formatTrackingStatusLabel(status: string) {
  switch (status) {
    case 'recibido':
      return 'Recibido';
    case 'en_proceso':
      return 'En proceso';
    case 'radicado':
      return 'Radicado';
    case 'error_temporal':
      return 'Error temporal';
    case 'fallido':
      return 'Fallido';
    default:
      return status;
  }
}

function shouldContinuePolling(status: string) {
  return status === 'recibido' || status === 'en_proceso' || status === 'error_temporal';
}

function formatStatusDate(value?: string) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedType, setSelectedType] = useState('Peticion');
  const [responseMedium, setResponseMedium] = useState<ResponseMedium>('correo_electronico');
  const [informalContext, setInformalContext] = useState('');
  const [formalLetter, setFormalLetter] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [radicadoCode, setRadicadoCode] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [trackingSnapshot, setTrackingSnapshot] = useState<TrackingSnapshot | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [trackingStatusError, setTrackingStatusError] = useState('');
  const [locationNotice, setLocationNotice] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('Buscando direccion...');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [submitStageStatus, setSubmitStageStatus] = useState<SubmitStageStatus[]>([
    'pending',
    'pending',
    'pending',
    'pending',
  ]);
  const [submitStageDurations, setSubmitStageDurations] = useState<Array<number | null>>([
    null,
    null,
    null,
    null,
  ]);

  const submitStages = [
    'Conectando con la oficina de atencion...',
    'Preparando y validando el formulario...',
    'Enviando solicitud de radicacion...',
    'Confirmando numero de radicado...',
  ];

  const stageOpacity = useRef(submitStages.map(() => new Animated.Value(0.45))).current;
  const stageTranslateY = useRef(submitStages.map(() => new Animated.Value(6))).current;
  const stageCheckScale = useRef(submitStages.map(() => new Animated.Value(1))).current;
  const previousStageStatus = useRef<SubmitStageStatus[]>(submitStageStatus);
  const statusPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setStageActive = (index: number) => {
    setSubmitStageStatus((prev) =>
      prev.map((status, i) => {
        if (i < index && status !== 'done') return 'done';
        if (i === index) return 'active';
        return i > index ? 'pending' : status;
      })
    );
  };

  const setStageDone = (index: number, durationMs: number) => {
    setSubmitStageStatus((prev) => prev.map((status, i) => (i === index ? 'done' : status)));
    setSubmitStageDurations((prev) => prev.map((value, i) => (i === index ? durationMs : value)));
  };
  const [appNotice, setAppNotice] = useState({
    visible: false,
    title: '',
    message: '',
    tone: 'info' as 'info' | 'success' | 'error',
  });

  const showAppNotice = (title: string, message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    setAppNotice({ visible: true, title, message, tone });
  };

  useEffect(() => {
    if (!isSubmitting) {
      stageOpacity.forEach((value) => value.setValue(0.45));
      stageTranslateY.forEach((value) => value.setValue(6));
      stageCheckScale.forEach((value) => value.setValue(1));
      previousStageStatus.current = submitStageStatus;
      return;
    }

    submitStageStatus.forEach((status, index) => {
      const toOpacity = status === 'pending' ? 0.45 : 1;
      const toTranslate = status === 'pending' ? 6 : 0;

      Animated.parallel([
        Animated.timing(stageOpacity[index], {
          toValue: toOpacity,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(stageTranslateY[index], {
          toValue: toTranslate,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      const previous = previousStageStatus.current[index];
      if (previous !== 'done' && status === 'done') {
        stageCheckScale[index].setValue(0.75);
        Animated.spring(stageCheckScale[index], {
          toValue: 1,
          friction: 5,
          tension: 130,
          useNativeDriver: true,
        }).start();
      }
    });

    previousStageStatus.current = submitStageStatus;
  }, [isSubmitting, submitStageStatus, stageCheckScale, stageOpacity, stageTranslateY]);

  const [personalData, setPersonalData] = useState<PersonalData>({
    fullName: '',
    idNumber: '',
    email: '',
    phone: '',
  });

  const [region, setRegion] = useState<Region>({
    latitude: 4.8143,
    longitude: -75.6946,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  });

  const [selectedPoint, setSelectedPoint] = useState<LocationPoint | null>({
    latitude: 4.8143,
    longitude: -75.6946,
  });

  useEffect(() => {
    const loadCurrentLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const point = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setRegion((prev) => ({
        ...prev,
        latitude: point.latitude,
        longitude: point.longitude,
      }));
      setSelectedPoint(point);
    };

    loadCurrentLocation().catch(() => {
      setLocationNotice('No fue posible obtener la ubicación actual. Puedes seleccionar el punto manualmente.');
    });
  }, []);

  useEffect(() => {
    const resolveAddress = async () => {
      if (!selectedPoint) {
        setSelectedAddress('Direccion no disponible para este punto.');
        return;
      }

      setIsResolvingAddress(true);
      try {
        const [result] = await Location.reverseGeocodeAsync({
          latitude: selectedPoint.latitude,
          longitude: selectedPoint.longitude,
        });
        setSelectedAddress(formatAddressFromReverseGeocode(result || null));
      } catch {
        setSelectedAddress('No se pudo obtener la direccion del punto seleccionado.');
      } finally {
        setIsResolvingAddress(false);
      }
    };

    resolveAddress().catch(() => {
      setSelectedAddress('No se pudo obtener la direccion del punto seleccionado.');
      setIsResolvingAddress(false);
    });
  }, [selectedPoint?.latitude, selectedPoint?.longitude]);

  const progress = useMemo(() => (currentStep / TOTAL_STEPS) * 100, [currentStep]);

  const androidMapHtml = useMemo(() => {
    const lat = selectedPoint?.latitude ?? region.latitude;
    const lng = selectedPoint?.longitude ?? region.longitude;
    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { height: 100%; margin: 0; padding: 0; }
      .leaflet-control-attribution { font-size: 10px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      var map = L.map('map').setView([${lat}, ${lng}], 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      var marker = L.marker([${lat}, ${lng}]).addTo(map);

      map.on('click', function (e) {
        marker.setLatLng(e.latlng);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'mapPress',
          latitude: e.latlng.lat,
          longitude: e.latlng.lng
        }));
      });
    </script>
  </body>
</html>`;
  }, [region.latitude, region.longitude, selectedPoint?.latitude, selectedPoint?.longitude]);

  const onMapPress = (event: MapPressEvent) => {
    const point = event.nativeEvent.coordinate;
    setSelectedPoint({ latitude: point.latitude, longitude: point.longitude });
  };

  const onAndroidMapMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapPress' && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        setSelectedPoint({ latitude: data.latitude, longitude: data.longitude });
      }
    } catch {
      // Ignore malformed messages from webview.
    }
  };

  const onPickPhoto = async () => {
    if (photos.length >= 10) {
      showAppNotice('Limite de anexos', 'Solo se permite anexar maximo 10 archivos.', 'info');
      return;
    }

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showAppNotice('Permiso requerido', 'Debes permitir acceso a galeria para adjuntar fotos.', 'info');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      const fileSize = asset.fileSize ?? 0;
      if (fileSize > 27 * 1024 * 1024) {
        showAppNotice('Archivo demasiado grande', 'Cada archivo debe ser menor o igual a 27 MB.', 'error');
        return;
      }

      setPhotos((prev) => [...prev, asset.uri]);
    }
  };

  const canContinue = useMemo(() => {
    if (currentStep === 1) {
      return !!selectedPoint;
    }
    if (currentStep === 2) {
      return informalContext.trim().length > 15;
    }
    if (currentStep === 3) {
      if (responseMedium === 'correo_electronico') {
        return personalData.email.includes('@');
      }
      return true;
    }
    if (currentStep === 4) {
      return formalLetter.trim().length > 20;
    }
    return true;
  }, [currentStep, formalLetter, informalContext, personalData, selectedPoint]);

  const handleRewrite = () => {
    const rewritten = buildFormalLetter({
      type: selectedType,
      informalContext,
      personalData,
      point: selectedPoint,
    });
    setFormalLetter(rewritten);
    showAppNotice('Carta lista', 'Tu contexto fue convertido a un formato formal para radicacion.', 'success');
  };

  const mapTypeToApi = (value: string) => {
    const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (normalized === 'peticion') return 'peticion';
    if (normalized === 'queja') return 'queja';
    if (normalized === 'reclamo') return 'reclamo';
    if (normalized === 'sugerencia') return 'sugerencia';
    return 'denuncia';
  };

  const generateSubjectFromMessage = (message: string, type: string) => {
    const compact = message.replace(/\s+/g, ' ').trim();
    const firstSlice = compact.slice(0, 80);
    return firstSlice ? `${type}: ${firstSlice}` : `${type}: Solicitud ciudadana`;
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const ensureMinStageDuration = async (stageStartedAt: number, minDurationMs: number) => {
    const elapsed = Date.now() - stageStartedAt;
    if (elapsed < minDurationMs) {
      await wait(minDurationMs - elapsed);
    }
    return Date.now() - stageStartedAt;
  };

  const fetchTrackingStatus = async (code: string, timeoutMs = 10000) => {
    if (!code) {
      return;
    }

    setIsRefreshingStatus(true);
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/pqrs/status/${encodeURIComponent(code)}`, { method: 'GET' }, timeoutMs);
      const payload = await response.json();

      if (!response.ok || !payload?.ok || !payload?.data) {
        throw new Error(payload?.message || payload?.detail || 'No fue posible consultar el estado actual');
      }

      setTrackingSnapshot(payload.data as TrackingSnapshot);
      setTrackingStatusError('');
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message : 'No fue posible consultar el estado';
      setTrackingStatusError(safeMessage);
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  useEffect(() => {
    return () => {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (statusPollingRef.current) {
      clearInterval(statusPollingRef.current);
      statusPollingRef.current = null;
    }

    if (currentStep !== 5 || !trackingCode) {
      return;
    }

    fetchTrackingStatus(trackingCode).catch(() => {
      setTrackingStatusError('No fue posible consultar el estado');
    });

    const activeStatus = trackingSnapshot?.status || '';
    if (shouldContinuePolling(activeStatus)) {
      statusPollingRef.current = setInterval(() => {
        fetchTrackingStatus(trackingCode, 7000).catch(() => {
          setTrackingStatusError('No fue posible actualizar el estado');
        });
      }, 8000);
    }

    return () => {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
    };
  }, [currentStep, trackingCode, trackingSnapshot?.status]);

  const handleSend = async () => {
    setIsSubmitting(true);
    setSubmitStageStatus(['active', 'pending', 'pending', 'pending']);
    setSubmitStageDurations([null, null, null, null]);

    try {
      let stageStart = Date.now();

      setStageActive(0);
      const healthResponse = await fetchWithTimeout(`${API_BASE_URL}/health`, { method: 'GET' }, 5000);
      if (!healthResponse.ok) {
        throw new Error('El backend de radicacion no esta disponible.');
      }
      const stage0Duration = await ensureMinStageDuration(stageStart, 900);
      setStageDone(0, stage0Duration);

      stageStart = Date.now();
      setStageActive(1);

      const formData = new FormData();
      formData.append('medioRespuesta', responseMedium);
      formData.append('correo', personalData.email || '');
      formData.append('tipoSolicitud', mapTypeToApi(selectedType));
      formData.append('asunto', generateSubjectFromMessage(informalContext, selectedType));
      formData.append('descripcion', formalLetter.trim());
      formData.append('aceptarTratamiento', 'true');

      photos.forEach((uri, index) => {
        const lowerUri = uri.toLowerCase();
        const isPng = lowerUri.endsWith('.png');
        const isGif = lowerUri.endsWith('.gif');
        const isTiff = lowerUri.endsWith('.tif') || lowerUri.endsWith('.tiff');
        const extension = isPng ? 'png' : isGif ? 'gif' : isTiff ? 'tiff' : 'jpg';
        const mimeType = isPng
          ? 'image/png'
          : isGif
            ? 'image/gif'
            : isTiff
              ? 'image/tiff'
              : 'image/jpeg';
        const filename = `evidencia_${index + 1}.${extension}`;
        formData.append('files', {
          uri,
          name: filename,
          type: mimeType,
        } as unknown as Blob);
      });
      const stage1Duration = await ensureMinStageDuration(stageStart, 900);
      setStageDone(1, stage1Duration);

      stageStart = Date.now();
      setStageActive(2);

      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/pqrs/submit-anonymous`,
        {
          method: 'POST',
          body: formData,
        },
        45000
      );
      const stage2Duration = await ensureMinStageDuration(stageStart, 1200);
      setStageDone(2, stage2Duration);

      stageStart = Date.now();
      setStageActive(3);

      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.detail || payload?.message || 'No fue posible radicar la solicitud en este intento');
      }

      const realCode = payload?.data?.radicado || payload?.data?.consecutive || generateRadicado(selectedType);
      setRadicadoCode(realCode);
        setTrackingCode(payload?.data?.trackingCode || '');
        setTrackingSnapshot(null);
        setTrackingStatusError('');
        const stage3Duration = await ensureMinStageDuration(stageStart, 1200);
        setStageDone(3, stage3Duration);
      setCurrentStep(5);
    } catch (error) {
      let safeMessage = error instanceof Error ? error.message : 'Error no controlado';
      if (error instanceof Error && error.name === 'AbortError') {
        safeMessage = 'La radicacion tardo demasiado. Intenta de nuevo en unos segundos.';
      }
      showAppNotice('No se pudo radicar', safeMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    if (currentStep === 1) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>1. Elige la ubicación del caso</Text>
          <Text style={styles.stepHint}>
            Puedes usar tu ubicación actual o tocar en el mapa para marcar el punto exacto.
          </Text>
          {locationNotice ? <Text style={styles.noticeText}>{locationNotice}</Text> : null}
          {Platform.OS === 'android' ? (
            <View style={styles.mapWebContainer}>
              <WebView
                originWhitelist={['*']}
                source={{ html: androidMapHtml }}
                onMessage={onAndroidMapMessage}
                style={styles.mapWebView}
              />
            </View>
          ) : (
            <MapView style={styles.map} region={region} onPress={onMapPress}>
              {selectedPoint ? <Marker coordinate={selectedPoint} title="Punto del reporte" /> : null}
            </MapView>
          )}
          {selectedPoint ? (
            <Text style={styles.addressText}>
              Direccion seleccionada: {isResolvingAddress ? 'Buscando...' : selectedAddress}
            </Text>
          ) : null}
        </View>
      );
    }

    if (currentStep === 2) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>2. 🗣️ Tipo de solicitud y mensaje ciudadano</Text>
          <Text style={styles.stepHint}>Escribe como si le dijeras a un conocido. La app lo formaliza ✨</Text>
          <View style={styles.chipsRow}>
            {PQRD_TYPES.map((item) => (
              <Pressable
                key={item}
                style={[styles.chip, selectedType === item && styles.chipActive]}
                onPress={() => setSelectedType(item)}
              >
                <Text style={[styles.chipText, selectedType === item && styles.chipTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.groupLabel}>Medio de respuesta</Text>
          <View style={styles.chipsRow}>
            <Pressable
              style={[styles.chip, responseMedium === 'correo_electronico' && styles.chipActive]}
              onPress={() => setResponseMedium('correo_electronico')}
            >
              <Text style={[styles.chipText, responseMedium === 'correo_electronico' && styles.chipTextActive]}>
                Correo electronico
              </Text>
            </Pressable>
            <Pressable
              style={[styles.chip, responseMedium === 'cartelera' && styles.chipActive]}
              onPress={() => setResponseMedium('cartelera')}
            >
              <Text style={[styles.chipText, responseMedium === 'cartelera' && styles.chipTextActive]}>
                Cartelera
              </Text>
            </Pressable>
            <Pressable
              style={[styles.chip, responseMedium === 'correo_fisico' && styles.chipActive]}
              onPress={() => setResponseMedium('correo_fisico')}
            >
              <Text style={[styles.chipText, responseMedium === 'correo_fisico' && styles.chipTextActive]}>
                Correo fisico
              </Text>
            </Pressable>
          </View>
          <TextInput
            multiline
            value={informalContext}
            onChangeText={setInformalContext}
            placeholder="Ejemplo: Hay muchos huecos en la avenida y cada dia esta peor..."
            placeholderTextColor="#8f8f8f"
            style={styles.textArea}
          />
          <Text style={styles.counterText}>Mínimo sugerido: 15 caracteres</Text>
        </View>
      );
    }

    if (currentStep === 3) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>3. Evidencias y datos personales</Text>
          <Text style={styles.stepHint}>
            Adjuntar evidencia fotográfica es opcional. Si no tienes fotos, puedes continuar con los datos personales.
          </Text>
          <Text style={styles.counterText}>Reglas: maximo 10 archivos, 27 MB por archivo.</Text>

          <Pressable style={styles.photoButton} onPress={onPickPhoto}>
            <Text style={styles.photoButtonText}>Agregar Foto (Opcional)</Text>
          </Pressable>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoList}>
            {photos.length === 0 ? (
              <Text style={styles.emptyPhotoText}>No adjuntaste fotos. Este campo es opcional.</Text>
            ) : (
              photos.map((uri) => <Image key={uri} source={{ uri }} style={styles.photoItem} />)
            )}
          </ScrollView>

          <TextInput
            value={personalData.fullName}
            onChangeText={(text) => setPersonalData((prev) => ({ ...prev, fullName: text }))}
            placeholder="Nombre completo (opcional en anonimo)"
            placeholderTextColor="#8f8f8f"
            style={styles.input}
          />
          <TextInput
            value={personalData.idNumber}
            onChangeText={(text) => setPersonalData((prev) => ({ ...prev, idNumber: text }))}
            placeholder="Documento (opcional en anonimo)"
            placeholderTextColor="#8f8f8f"
            style={styles.input}
            keyboardType="number-pad"
          />
          <TextInput
            value={personalData.email}
            onChangeText={(text) => setPersonalData((prev) => ({ ...prev, email: text }))}
            placeholder={
              responseMedium === 'correo_electronico'
                ? 'Correo electronico (obligatorio para respuesta por correo)'
                : 'Correo electronico (opcional)'
            }
            placeholderTextColor="#8f8f8f"
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            value={personalData.phone}
            onChangeText={(text) => setPersonalData((prev) => ({ ...prev, phone: text }))}
            placeholder="Teléfono"
            placeholderTextColor="#8f8f8f"
            style={styles.input}
            keyboardType="phone-pad"
          />
        </View>
      );
    }

    if (currentStep === 4) {
      const completedCount = submitStageStatus.filter((status) => status === 'done').length;
      const activeCount = submitStageStatus.some((status) => status === 'active') ? 1 : 0;
      const progressPercent = ((completedCount + activeCount * 0.45) / submitStages.length) * 100;

      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>4. 🪄 Reescritura formal y revisión</Text>
          <Text style={styles.stepHint}>
            Pulsa “Redactar carta” para transformar tu relato informal en redaccion institucional.
          </Text>
          <Pressable style={styles.rewriteButton} onPress={handleRewrite}>
            <Text style={styles.rewriteButtonText}>📝 Redactar carta</Text>
          </Pressable>
          <TextInput
            multiline
            value={formalLetter}
            onChangeText={setFormalLetter}
            placeholder="Aquí aparecerá la carta formal..."
            placeholderTextColor="#8f8f8f"
            style={styles.formalTextArea}
          />

          {isSubmitting ? (
            <View style={styles.progressPanel}>
              <Text style={styles.progressPanelTitle}>Enviando tu solicitud...</Text>

              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${Math.max(8, progressPercent)}%` }]} />
              </View>

              {submitStages.map((stage, index) => {
                const status = submitStageStatus[index];
                const duration = submitStageDurations[index];
                return (
                  <Animated.View
                    key={stage}
                    style={[
                      styles.progressLine,
                      {
                        opacity: stageOpacity[index],
                        transform: [{ translateY: stageTranslateY[index] }],
                      },
                    ]}
                  >
                    <Animated.View
                      style={[
                        styles.progressIcon,
                        status === 'done'
                          ? styles.progressIconDone
                          : status === 'active'
                            ? styles.progressIconActive
                            : styles.progressIconPending,
                        { transform: [{ scale: status === 'done' ? stageCheckScale[index] : 1 }] },
                      ]}
                    >
                      <Text
                        style={[
                          styles.progressIconText,
                          status === 'done'
                            ? styles.progressIconTextDone
                            : status === 'active'
                              ? styles.progressIconTextActive
                              : styles.progressIconTextPending,
                        ]}
                      >
                        {status === 'done' ? '✓' : status === 'active' ? '•' : ''}
                      </Text>
                    </Animated.View>
                    <Text
                      style={[
                        styles.progressLabel,
                        status === 'done'
                          ? styles.progressLabelDone
                          : status === 'active'
                            ? styles.progressLabelActive
                            : styles.progressLabelPending,
                      ]}
                    >
                      {stage}
                    </Text>
                    {duration !== null ? <Text style={styles.progressDuration}>{`${(duration / 1000).toFixed(1)}s`}</Text> : null}
                  </Animated.View>
                );
              })}
            </View>
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>✅ Radicación completada</Text>
        <Text style={styles.successTitle}>Tu caso fue registrado correctamente 🎉</Text>
        <Text style={styles.successCode}>{radicadoCode}</Text>
        {trackingCode ? <Text style={styles.trackingCodeText}>Tracking interno: {trackingCode}</Text> : null}
        <Text style={styles.stepHint}>
          Guarda este número para hacer seguimiento. También puedes radicar otro caso desde el botón inferior.
        </Text>

        <View style={styles.statusPanel}>
          <Text style={styles.statusPanelTitle}>Seguimiento del estado</Text>
          <Text style={styles.statusValueText}>
            Estado actual:{' '}
            {trackingSnapshot?.status
              ? formatTrackingStatusLabel(trackingSnapshot.status)
              : trackingCode
                ? 'Consultando...'
                : 'No disponible'}
          </Text>
          {trackingSnapshot?.radicadoOficial ? (
            <Text style={styles.statusMetaText}>Radicado oficial: {trackingSnapshot.radicadoOficial}</Text>
          ) : null}
          {trackingSnapshot?.consecutivoOficial ? (
            <Text style={styles.statusMetaText}>Consecutivo oficial: {trackingSnapshot.consecutivoOficial}</Text>
          ) : null}
          {trackingSnapshot?.updatedAt ? (
            <Text style={styles.statusMetaText}>Ultima actualizacion: {formatStatusDate(trackingSnapshot.updatedAt)}</Text>
          ) : null}
          {trackingSnapshot?.lastErrorMessage ? (
            <Text style={styles.statusErrorText}>Detalle de error: {trackingSnapshot.lastErrorMessage}</Text>
          ) : null}
          {trackingStatusError ? <Text style={styles.statusErrorText}>{trackingStatusError}</Text> : null}

          <Pressable
            style={[styles.statusRefreshButton, (!trackingCode || isRefreshingStatus) && styles.primaryDisabled]}
            disabled={!trackingCode || isRefreshingStatus}
            onPress={() => fetchTrackingStatus(trackingCode)}
          >
            <Text style={styles.statusRefreshButtonText}>
              {isRefreshingStatus ? 'Actualizando...' : 'Actualizar estado'}
            </Text>
          </Pressable>

          {trackingSnapshot?.events?.length ? (
            <View style={styles.timelineWrap}>
              {trackingSnapshot.events.map((event, index) => (
                <View key={`${event.created_at}-${index}`} style={styles.timelineItem}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineTitle}>{formatTrackingStatusLabel(event.to_status)}</Text>
                    {event.detail ? <Text style={styles.timelineDetail}>{event.detail}</Text> : null}
                    {event.created_at ? <Text style={styles.timelineDate}>{formatStatusDate(event.created_at)}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <Pressable
          style={styles.restartButton}
          onPress={() => {
            if (statusPollingRef.current) {
              clearInterval(statusPollingRef.current);
              statusPollingRef.current = null;
            }
            setCurrentStep(1);
            setInformalContext('');
            setFormalLetter('');
            setPhotos([]);
            setPersonalData({ fullName: '', idNumber: '', email: '', phone: '' });
            setRadicadoCode('');
            setTrackingCode('');
            setTrackingSnapshot(null);
            setTrackingStatusError('');
          }}
        >
          <Text style={styles.restartButtonText}>🔁 Radicar otro caso</Text>
        </Pressable>
      </View>
    );
  };

  if (!fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#0e766e" />
      </View>
    );
  }

  return (
    <LinearGradient colors={['#e8f7f2', '#ecf8ff', '#fffaf0']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />

        <View style={styles.header}>
          <Text style={styles.appTitle}>Pereira Te Escucha 🏛️</Text>
          <Text style={styles.appSubtitle}>Radica tu PQRD de forma ágil y clara ✨</Text>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>Paso {currentStep} de {TOTAL_STEPS}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.contentContainer}>{renderStepContent()}</ScrollView>

        {currentStep < 5 ? (
          <View style={styles.footerActions}>
            {currentStep > 1 ? (
              <Pressable style={styles.secondaryAction} onPress={() => setCurrentStep((prev) => prev - 1)}>
                <Text style={styles.secondaryActionText}>Atrás</Text>
              </Pressable>
            ) : (
              <View />
            )}

            {currentStep === 4 ? (
              <Pressable
                style={[styles.primaryAction, (!canContinue || isSubmitting) && styles.primaryDisabled]}
                disabled={!canContinue || isSubmitting}
                onPress={handleSend}
              >
                <Text style={styles.primaryActionText}>{isSubmitting ? 'Enviando...' : 'Enviar y Radicar'}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.primaryAction, !canContinue && styles.primaryDisabled]}
                disabled={!canContinue}
                onPress={() => setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS))}
              >
                <Text style={styles.primaryActionText}>Continuar</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <Modal
          animationType="fade"
          transparent
          visible={appNotice.visible}
          onRequestClose={() => setAppNotice((prev) => ({ ...prev, visible: false }))}
        >
          <View style={styles.noticeOverlay}>
            <View style={styles.noticeCard}>
              <Text
                style={[
                  styles.noticeTitle,
                  appNotice.tone === 'success'
                    ? styles.noticeTitleSuccess
                    : appNotice.tone === 'error'
                      ? styles.noticeTitleError
                      : styles.noticeTitleInfo,
                ]}
              >
                {appNotice.title}
              </Text>
              <Text style={styles.noticeMessage}>{appNotice.message}</Text>
              <Pressable
                style={styles.noticeButton}
                onPress={() => setAppNotice((prev) => ({ ...prev, visible: false }))}
              >
                <Text style={styles.noticeButtonText}>Entendido</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 18,
  },
  keyboardAvoidContainer: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5fbf8',
  },
  header: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  appTitle: {
    fontSize: 28,
    color: '#0f4c5c',
    fontFamily: 'Sora_700Bold',
  },
  appSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#2b5b67',
    fontFamily: 'Sora_400Regular',
  },
  progressWrap: {
    marginBottom: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#d7ece8',
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: '#0e766e',
    borderRadius: 999,
  },
  progressText: {
    marginTop: 7,
    color: '#3b6369',
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
  },
  contentContainer: {
    paddingBottom: 22,
  },
  stepCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbefea',
    shadowColor: '#235a57',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  stepTitle: {
    fontSize: 18,
    color: '#18353e',
    fontFamily: 'Sora_700Bold',
  },
  stepHint: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 13,
    color: '#44656d',
    lineHeight: 19,
    fontFamily: 'Sora_400Regular',
  },
  noticeText: {
    marginBottom: 10,
    color: '#7a5d13',
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
  },
  noticeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 30, 35, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  noticeCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d7ece8',
  },
  noticeTitle: {
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    marginBottom: 8,
  },
  noticeTitleInfo: {
    color: '#134c58',
  },
  noticeTitleSuccess: {
    color: '#0f766e',
  },
  noticeTitleError: {
    color: '#b42318',
  },
  noticeMessage: {
    fontFamily: 'Sora_400Regular',
    color: '#355962',
    lineHeight: 21,
    fontSize: 14,
  },
  noticeButton: {
    marginTop: 16,
    backgroundColor: '#0e766e',
    borderRadius: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  noticeButtonText: {
    color: '#ffffff',
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  map: {
    height: 270,
    borderRadius: 16,
    overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
  },
  mapWebContainer: {
    height: 270,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d1e6e2',
  },
  mapWebView: {
    flex: 1,
    backgroundColor: '#f4f7f6',
  },
  addressText: {
    marginTop: 10,
    fontSize: 12,
    color: '#355b58',
    fontFamily: 'Sora_600SemiBold',
  },
  progressPanel: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d6ebe6',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f8fdfa',
  },
  progressPanelTitle: {
    fontFamily: 'Sora_700Bold',
    fontSize: 14,
    color: '#1b4e57',
    marginBottom: 8,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#dbeee9',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: 8,
    backgroundColor: '#0e766e',
    borderRadius: 999,
  },
  progressLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  progressIcon: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  progressIconDone: {
    backgroundColor: '#1f8a5b',
  },
  progressIconActive: {
    borderWidth: 2,
    borderColor: '#0e766e',
    backgroundColor: '#e9f7f4',
  },
  progressIconPending: {
    borderWidth: 1,
    borderColor: '#c9e0dc',
    backgroundColor: '#ffffff',
  },
  progressIconText: {
    fontSize: 11,
    fontFamily: 'Sora_700Bold',
    lineHeight: 13,
  },
  progressIconTextDone: {
    color: '#ffffff',
  },
  progressIconTextActive: {
    color: '#0e766e',
  },
  progressIconTextPending: {
    color: '#8aa9a4',
  },
  progressLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Sora_400Regular',
  },
  progressLabelDone: {
    color: '#1f8a5b',
  },
  progressLabelActive: {
    color: '#0e766e',
    fontFamily: 'Sora_600SemiBold',
  },
  progressLabelPending: {
    color: '#7f9d9a',
  },
  progressDuration: {
    marginLeft: 8,
    fontSize: 11,
    color: '#6f8e8a',
    fontFamily: 'Sora_600SemiBold',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e8f3ef',
  },
  chipActive: {
    backgroundColor: '#0e766e',
  },
  chipText: {
    color: '#365b57',
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  textArea: {
    minHeight: 170,
    textAlignVertical: 'top',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c8e0db',
    backgroundColor: '#f8fdfb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1d4048',
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  counterText: {
    marginTop: 8,
    color: '#66838b',
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
  },
  groupLabel: {
    marginBottom: 8,
    marginTop: 2,
    color: '#335862',
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  photoButton: {
    backgroundColor: '#f19832',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 12,
  },
  photoButtonText: {
    color: '#ffffff',
    fontFamily: 'Sora_700Bold',
    fontSize: 13,
  },
  photoList: {
    minHeight: 96,
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  emptyPhotoText: {
    color: '#6b8b8f',
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
  },
  photoItem: {
    width: 94,
    height: 94,
    borderRadius: 10,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8e0db',
    backgroundColor: '#f8fdfb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1d4048',
    fontFamily: 'Sora_400Regular',
    marginTop: 9,
  },
  rewriteButton: {
    backgroundColor: '#157f71',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 12,
  },
  rewriteButtonText: {
    color: '#ffffff',
    fontFamily: 'Sora_700Bold',
    fontSize: 13,
  },
  formalTextArea: {
    minHeight: 290,
    textAlignVertical: 'top',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c8e0db',
    backgroundColor: '#f8fdfb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1d4048',
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  successTitle: {
    marginTop: 18,
    fontSize: 16,
    color: '#1f4f57',
    fontFamily: 'Sora_600SemiBold',
  },
  successCode: {
    marginTop: 10,
    marginBottom: 14,
    fontSize: 23,
    color: '#0e766e',
    letterSpacing: 0.4,
    fontFamily: 'Sora_700Bold',
  },
  trackingCodeText: {
    marginTop: -2,
    marginBottom: 8,
    color: '#2f5f68',
    fontSize: 12,
    fontFamily: 'Sora_600SemiBold',
  },
  statusPanel: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d2e7e2',
    backgroundColor: '#f6fcfa',
    padding: 12,
  },
  statusPanelTitle: {
    color: '#1d4f58',
    fontSize: 14,
    marginBottom: 8,
    fontFamily: 'Sora_700Bold',
  },
  statusValueText: {
    color: '#214c54',
    fontSize: 13,
    fontFamily: 'Sora_600SemiBold',
  },
  statusMetaText: {
    marginTop: 6,
    color: '#42656d',
    fontSize: 12,
    fontFamily: 'Sora_400Regular',
  },
  statusErrorText: {
    marginTop: 8,
    color: '#b42318',
    fontSize: 12,
    fontFamily: 'Sora_600SemiBold',
  },
  statusRefreshButton: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#0f4c5c',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statusRefreshButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'Sora_700Bold',
  },
  timelineWrap: {
    marginTop: 12,
    gap: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 9,
    height: 9,
    marginTop: 4,
    borderRadius: 99,
    backgroundColor: '#0e766e',
    marginRight: 8,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    color: '#1f4e57',
    fontSize: 12,
    fontFamily: 'Sora_600SemiBold',
  },
  timelineDetail: {
    marginTop: 2,
    color: '#4e6e76',
    fontSize: 11,
    fontFamily: 'Sora_400Regular',
    lineHeight: 16,
  },
  timelineDate: {
    marginTop: 2,
    color: '#6f8e96',
    fontSize: 11,
    fontFamily: 'Sora_400Regular',
  },
  restartButton: {
    marginTop: 16,
    backgroundColor: '#0f4c5c',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  restartButtonText: {
    color: '#ffffff',
    fontFamily: 'Sora_700Bold',
    fontSize: 13,
  },
  footerActions: {
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  secondaryAction: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#dfece9',
  },
  secondaryActionText: {
    color: '#355962',
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  primaryAction: {
    minWidth: 162,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0e766e',
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  primaryActionText: {
    color: '#ffffff',
    fontFamily: 'Sora_700Bold',
    fontSize: 13,
  },
});
