import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Region } from 'react-native-maps';
import { MapPressEvent } from 'react-native-maps';
import { WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useFonts, Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import * as Sentry from '@sentry/react-native';

import { API_BASE_URL, BACKEND_API_TOKEN, SUBMIT_TIMEOUT_MS, STATUS_TIMEOUT_MS, STATUS_POLL_BASE_MS, STATUS_POLL_MAX_MS, STATUS_POLL_JITTER_PCT, STATUS_POLL_MAX_ELAPSED_MS, STATUS_POLL_MAX_ATTEMPTS, STATUS_POLL_MAX_CONSECUTIVE_ERRORS, STATUS_RESUME_STALE_MS, SENTRY_DSN } from './src/config/env';
import { LocationPoint, PersonalData, ResponseMedium, SubmitStageStatus, TrackingSnapshot } from './src/types';
import { fetchWithTimeout, readJsonSafe, buildBackendHeaders } from './src/services/api';
import { fetchTrackingStatus as fetchTrackingStatusApi } from './src/services/tracking';
import { buildFormalLetter } from './src/services/letter';
import { formatAddressFromReverseGeocode, shouldContinuePolling, computeBackoffDelayMs, generateSubjectFromMessage, mapTypeToApi } from './src/utils/formatters';
import { styles } from './src/styles';
import StepLocation from './src/components/StepLocation';
import StepMessage from './src/components/StepMessage';
import StepEvidence from './src/components/StepEvidence';
import StepReview from './src/components/StepReview';
import StepStatus from './src/components/StepStatus';
import AppNoticeModal from './src/components/AppNotice';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
  attachScreenshot: true,
});

const TOTAL_STEPS = 5;
const SUBMIT_STAGES = [
  'Conectando con la oficina de atencion...',
  'Preparando y validando el formulario...',
  'Enviando solicitud de radicacion...',
  'Solicitud recibida. Iniciando seguimiento...',
];

function App() {
  const [fontsLoaded] = useFonts({ Sora_400Regular, Sora_600SemiBold, Sora_700Bold });

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedType, setSelectedType] = useState('Peticion');
  const [responseMedium, setResponseMedium] = useState<ResponseMedium>('correo_electronico');
  const [informalContext, setInformalContext] = useState('');
  const [formalLetter, setFormalLetter] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const [trackingSnapshot, setTrackingSnapshot] = useState<TrackingSnapshot | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [trackingStatusError, setTrackingStatusError] = useState('');
  const [locationNotice, setLocationNotice] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('Buscando direccion...');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [submitStageStatus, setSubmitStageStatus] = useState<SubmitStageStatus[]>(['pending', 'pending', 'pending', 'pending']);
  const [submitStageDurations, setSubmitStageDurations] = useState<(number | null)[]>([null, null, null, null]);
  const [appNotice, setAppNotice] = useState({ visible: false, title: '', message: '', tone: 'info' as 'info' | 'success' | 'error' });
  const [personalData, setPersonalData] = useState<PersonalData>({ fullName: '', idNumber: '', email: '', phone: '' });
  const [region, setRegion] = useState<Region>({ latitude: 4.8143, longitude: -75.6946, latitudeDelta: 0.06, longitudeDelta: 0.06 });
  const [selectedPoint, setSelectedPoint] = useState<LocationPoint | null>({ latitude: 4.8143, longitude: -75.6946 });

  const stageOpacity = useRef(SUBMIT_STAGES.map(() => new Animated.Value(0.45))).current;
  const stageTranslateY = useRef(SUBMIT_STAGES.map(() => new Animated.Value(6))).current;
  const stageCheckScale = useRef(SUBMIT_STAGES.map(() => new Animated.Value(1))).current;
  const previousStageStatus = useRef<SubmitStageStatus[]>(submitStageStatus);
  const statusPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentStepRef = useRef(currentStep);
  const trackingCodeRef = useRef(trackingCode);
  const trackingStatusRef = useRef<string>('');
  const pollStartMsRef = useRef<number | null>(null);
  const pollAttemptRef = useRef(0);
  const pollConsecutiveErrorsRef = useRef(0);
  const pollLastRequestMsRef = useRef<number>(0);

  const showAppNotice = (title: string, message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    setAppNotice({ visible: true, title, message, tone });
  };

  const clearPollingTimer = () => {
    if (statusPollingRef.current) {
      clearTimeout(statusPollingRef.current);
      statusPollingRef.current = null;
    }
  };

  const resetPollingCounters = () => {
    pollStartMsRef.current = Date.now();
    pollAttemptRef.current = 0;
    pollConsecutiveErrorsRef.current = 0;
    pollLastRequestMsRef.current = 0;
    trackingStatusRef.current = trackingSnapshot?.status || '';
  };

  const stopAutoPolling = (message?: string) => {
    clearPollingTimer();
    if (message) setTrackingStatusError(message);
  };

  useEffect(() => {
    if (!isSubmitting) {
      stageOpacity.forEach((v) => v.setValue(0.45));
      stageTranslateY.forEach((v) => v.setValue(6));
      stageCheckScale.forEach((v) => v.setValue(1));
      previousStageStatus.current = submitStageStatus;
      return;
    }
    submitStageStatus.forEach((status, index) => {
      Animated.parallel([
        Animated.timing(stageOpacity[index], { toValue: status === 'pending' ? 0.45 : 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(stageTranslateY[index], { toValue: status === 'pending' ? 6 : 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
      const prev = previousStageStatus.current[index];
      if (prev !== 'done' && status === 'done') {
        stageCheckScale[index].setValue(0.75);
        Animated.spring(stageCheckScale[index], { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }).start();
      }
    });
    previousStageStatus.current = submitStageStatus;
  }, [isSubmitting, submitStageStatus]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const location = await Location.getCurrentPositionAsync({});
        const point = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        setRegion((prev) => ({ ...prev, latitude: point.latitude, longitude: point.longitude }));
        setSelectedPoint(point);
      } catch { setLocationNotice('No fue posible obtener la ubicación actual. Puedes seleccionar el punto manualmente.'); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedPoint) { setSelectedAddress('Direccion no disponible para este punto.'); return; }
    setIsResolvingAddress(true);
    Location.reverseGeocodeAsync({ latitude: selectedPoint.latitude, longitude: selectedPoint.longitude })
      .then(([result]) => setSelectedAddress(formatAddressFromReverseGeocode(result || null)))
      .catch(() => setSelectedAddress('No se pudo obtener la direccion del punto seleccionado.'))
      .finally(() => setIsResolvingAddress(false));
  }, [selectedPoint?.latitude, selectedPoint?.longitude]);

  const progress = useMemo(() => (currentStep / TOTAL_STEPS) * 100, [currentStep]);

  const androidMapHtml = useMemo(() => {
    const lat = selectedPoint?.latitude ?? region.latitude;
    const lng = selectedPoint?.longitude ?? region.longitude;
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" /><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" /><style>html,body,#map{height:100%;margin:0;padding:0}.leaflet-control-attribution{font-size:10px}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>var map=L.map('map').setView([${lat},${lng}],14);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);var marker=L.marker([${lat},${lng}]).addTo(map);map.on('click',function(e){marker.setLatLng(e.latlng);window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapPress',latitude:e.latlng.lat,longitude:e.latlng.lng}))});</script></body></html>`;
  }, [region.latitude, region.longitude, selectedPoint?.latitude, selectedPoint?.longitude]);

  const onMapPress = (event: MapPressEvent) => {
    const point = event.nativeEvent.coordinate;
    setSelectedPoint({ latitude: point.latitude, longitude: point.longitude });
    Sentry.addBreadcrumb({ category: 'ui', message: 'User selected location on map', level: 'info' });
  };

  const onAndroidMapMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapPress' && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        setSelectedPoint({ latitude: data.latitude, longitude: data.longitude });
      }
    } catch { /* ignore */ }
  };

  const onPickPhoto = async () => {
    if (photos.length >= 10) { showAppNotice('Limite de anexos', 'Solo se permite anexar maximo 10 archivos.', 'info'); return; }
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) { showAppNotice('Permiso requerido', 'Debes permitir acceso a galeria para adjuntar fotos.', 'info'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!result.canceled && result.assets[0]?.uri) {
      const fileSize = result.assets[0].fileSize ?? 0;
      if (fileSize > 27 * 1024 * 1024) { showAppNotice('Archivo demasiado grande', 'Cada archivo debe ser menor o igual a 27 MB.', 'error'); return; }
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const canContinue = useMemo(() => {
    if (currentStep === 1) return !!selectedPoint;
    if (currentStep === 2) return informalContext.trim().length > 15;
    if (currentStep === 3) return responseMedium !== 'correo_electronico' || personalData.email.includes('@');
    if (currentStep === 4) return formalLetter.trim().length > 20;
    return true;
  }, [currentStep, formalLetter, informalContext, personalData.email, responseMedium, selectedPoint]);

  const handleRewrite = () => {
    setFormalLetter(buildFormalLetter({ type: selectedType, informalContext, personalData, point: selectedPoint }));
    showAppNotice('Carta lista', 'Tu contexto fue convertido a un formato formal para radicacion.', 'success');
  };

  const setSubmitStageActive = (index: number) => {
    setSubmitStageStatus((prev) => prev.map((s, i) => i < index && s !== 'done' ? 'done' : i === index ? 'active' : i > index ? 'pending' : s));
  };

  const setSubmitStageDone = (index: number) => {
    setSubmitStageStatus((prev) => prev.map((s, i) => i === index ? 'done' : s));
  };

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const ensureMinStageDuration = async (start: number, min: number) => {
    const elapsed = Date.now() - start;
    if (elapsed < min) await wait(min - elapsed);
    return Date.now() - start;
  };

  const fetchTrackingStatus = useCallback(async (code: string, timeoutMs = 10000) => {
    pollLastRequestMsRef.current = Date.now();
    setIsRefreshingStatus(true);
    try {
      const result = await fetchTrackingStatusApi(code, timeoutMs, trackingStatusRef.current);
      if (result.snapshot) {
        trackingStatusRef.current = result.snapshot.status || '';
        setTrackingSnapshot(result.snapshot);
      }
      setTrackingStatusError(result.error || '');
      return result;
    } finally { setIsRefreshingStatus(false); }
  }, []);

  useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);
  useEffect(() => { trackingCodeRef.current = trackingCode; }, [trackingCode]);
  useEffect(() => { trackingStatusRef.current = trackingSnapshot?.status || ''; }, [trackingSnapshot?.status]);
  useEffect(() => { return () => clearPollingTimer(); }, []);

  useEffect(() => {
    clearPollingTimer();
    if (currentStep !== 5 || !trackingCode) return;
    const activeStatus = trackingSnapshot?.status || '';
    if (activeStatus && !shouldContinuePolling(activeStatus)) return;
    resetPollingCounters();

    const scheduleNextPoll = (delayMs: number) => {
      clearPollingTimer();
      statusPollingRef.current = setTimeout(async () => {
        if (currentStepRef.current !== 5 || !trackingCodeRef.current) { clearPollingTimer(); return; }
        const elapsedMs = Date.now() - (pollStartMsRef.current || Date.now());
        if (elapsedMs > STATUS_POLL_MAX_ELAPSED_MS) { stopAutoPolling('Seguimiento automatico pausado. Puedes actualizar manualmente el estado.'); return; }
        if (pollAttemptRef.current >= STATUS_POLL_MAX_ATTEMPTS) { stopAutoPolling('Se alcanzo el limite de consultas automaticas. Usa Actualizar estado para continuar.'); return; }
        pollAttemptRef.current += 1;
        const pollResult = await fetchTrackingStatus(trackingCodeRef.current, STATUS_TIMEOUT_MS);
        if (pollResult.terminal) { clearPollingTimer(); return; }
        if (!pollResult.ok) {
          pollConsecutiveErrorsRef.current += 1;
          if (pollConsecutiveErrorsRef.current >= STATUS_POLL_MAX_CONSECUTIVE_ERRORS) { stopAutoPolling('Seguimiento automatico pausado por errores de red. Reintenta manualmente.'); return; }
        } else {
          pollConsecutiveErrorsRef.current = 0;
          if (pollResult.statusChanged) pollAttemptRef.current = 0;
        }
        scheduleNextPoll(pollResult.retryAfterMs || computeBackoffDelayMs(pollAttemptRef.current + 1, STATUS_POLL_BASE_MS, STATUS_POLL_MAX_MS, STATUS_POLL_JITTER_PCT));
      }, delayMs);
    };

    fetchTrackingStatus(trackingCode, STATUS_TIMEOUT_MS).then((initialResult) => {
      if (initialResult.terminal) { clearPollingTimer(); return; }
      scheduleNextPoll(initialResult.retryAfterMs || computeBackoffDelayMs(1, STATUS_POLL_BASE_MS, STATUS_POLL_MAX_MS, STATUS_POLL_JITTER_PCT));
    }).catch(() => setTrackingStatusError('No fue posible consultar el estado'));

    return () => clearPollingTimer();
  }, [currentStep, trackingCode]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') { clearPollingTimer(); return; }
      if (currentStepRef.current !== 5 || !trackingCodeRef.current) return;
      if (!shouldContinuePolling(trackingStatusRef.current || '')) return;
      const staleMs = Date.now() - (pollLastRequestMsRef.current || 0);
      if (staleMs < STATUS_RESUME_STALE_MS) return;
      fetchTrackingStatus(trackingCodeRef.current, STATUS_TIMEOUT_MS).then((result) => {
        if (result.terminal) { clearPollingTimer(); return; }
        const delayMs = result.retryAfterMs || computeBackoffDelayMs(Math.max(1, pollAttemptRef.current + 1), STATUS_POLL_BASE_MS, STATUS_POLL_MAX_MS, STATUS_POLL_JITTER_PCT);
        clearPollingTimer();
        statusPollingRef.current = setTimeout(() => {
          if (currentStepRef.current === 5 && trackingCodeRef.current) {
            fetchTrackingStatus(trackingCodeRef.current, STATUS_TIMEOUT_MS).catch(() => setTrackingStatusError('No fue posible actualizar el estado'));
          }
        }, delayMs);
      }).catch(() => setTrackingStatusError('No fue posible consultar el estado al volver a la app'));
    });
    return () => subscription.remove();
  }, []);

  const handleSend = async () => {
    setIsSubmitting(true);
    setSubmitStageStatus(['active', 'pending', 'pending', 'pending']);
    setSubmitStageDurations([null, null, null, null]);

    try {
      let stageStart = Date.now();
      setSubmitStageStatus((prev) => prev.map((_, i) => i === 0 ? 'active' : 'pending'));
      const healthResponse = await fetchWithTimeout(`${API_BASE_URL}/health`, { method: 'GET', headers: buildBackendHeaders(BACKEND_API_TOKEN) }, 5000);
      if (!healthResponse.ok) throw new Error(`El backend de radicacion no esta disponible en ${API_BASE_URL}.`);
      setSubmitStageDurations((prev) => prev.map((v, i) => i === 0 ? (Date.now() - stageStart) : v));
      setSubmitStageDone(0);

      stageStart = Date.now();
      setSubmitStageActive(1);
      const formData = new FormData();
      formData.append('medioRespuesta', responseMedium);
      formData.append('correo', personalData.email || '');
      formData.append('tipoSolicitud', mapTypeToApi(selectedType));
      formData.append('asunto', generateSubjectFromMessage(informalContext, selectedType));
      formData.append('descripcion', formalLetter.trim());
      formData.append('aceptarTratamiento', 'true');
      photos.forEach((uri, index) => {
        const lower = uri.toLowerCase();
        const isPng = lower.endsWith('.png');
        const isGif = lower.endsWith('.gif');
        const isTiff = lower.endsWith('.tif') || lower.endsWith('.tiff');
        const ext = isPng ? 'png' : isGif ? 'gif' : isTiff ? 'tiff' : 'jpg';
        const mime = isPng ? 'image/png' : isGif ? 'image/gif' : isTiff ? 'image/tiff' : 'image/jpeg';
        formData.append('files', { uri, name: `evidencia_${index + 1}.${ext}`, type: mime } as unknown as Blob);
      });
      setSubmitStageDurations((prev) => prev.map((v, i) => i === 1 ? (Date.now() - stageStart) : v));
      setSubmitStageDone(1);

      stageStart = Date.now();
      setSubmitStageActive(2);
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/pqrs/submit-anonymous`, { method: 'POST', headers: buildBackendHeaders(BACKEND_API_TOKEN), body: formData }, SUBMIT_TIMEOUT_MS);
      setSubmitStageDurations((prev) => prev.map((v, i) => i === 2 ? (Date.now() - stageStart) : v));
      setSubmitStageDone(2);

      stageStart = Date.now();
      setSubmitStageActive(3);
      const payload = await readJsonSafe<{ ok?: boolean; data?: { trackingCode?: string }; message?: string; detail?: string }>(response);
      if (!response.ok || !payload?.ok) throw new Error(payload?.detail || payload?.message || `No fue posible radicar la solicitud en este intento (HTTP ${response.status})`);
      const acceptedTrackingCode = payload?.data?.trackingCode;
      if (!acceptedTrackingCode) throw new Error('El backend no retorno trackingCode para seguimiento.');
      Sentry.addBreadcrumb({ category: 'submission', message: `PQRD submitted: ${selectedType}`, level: 'info' });
      setTrackingCode(acceptedTrackingCode);
      setTrackingSnapshot(null);
      setTrackingStatusError('');
      setSubmitStageDurations((prev) => prev.map((v, i) => i === 3 ? (Date.now() - stageStart) : v));
      setSubmitStageDone(3);
      setCurrentStep(5);
    } catch (error) {
      let msg = error instanceof Error ? error.message : 'Error no controlado';
      if (error instanceof Error && error.name === 'AbortError') msg = `No se pudo completar el envio en el tiempo esperado (${Math.round(SUBMIT_TIMEOUT_MS / 1000)}s). Verifica conectividad con el backend (${API_BASE_URL}).`;
      else if (msg.toLowerCase().includes('network request failed')) msg = `No se pudo conectar con el backend (${API_BASE_URL}). Verifica EXPO_PUBLIC_API_BASE_URL.`;
      Sentry.captureMessage('PQRD submission failed', { level: 'warning', extra: { errorMessage: msg, apiUrl: API_BASE_URL, selectedType } });
      showAppNotice('No se pudo radicar', msg, 'error');
    } finally { setIsSubmitting(false); }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <StepLocation selectedPoint={selectedPoint} region={region} locationNotice={locationNotice} selectedAddress={selectedAddress} isResolvingAddress={isResolvingAddress} androidMapHtml={androidMapHtml} onMapPress={onMapPress} onAndroidMapMessage={onAndroidMapMessage} />;
      case 2:
        return <StepMessage selectedType={selectedType} setSelectedType={setSelectedType} responseMedium={responseMedium} setResponseMedium={setResponseMedium} informalContext={informalContext} setInformalContext={setInformalContext} />;
      case 3:
        return <StepEvidence photos={photos} responseMedium={responseMedium} personalData={personalData} setPersonalData={setPersonalData} onPickPhoto={onPickPhoto} />;
      case 4:
        return <StepReview formalLetter={formalLetter} setFormalLetter={setFormalLetter} handleRewrite={handleRewrite} isSubmitting={isSubmitting} submitStageStatus={submitStageStatus} submitStageDurations={submitStageDurations} submitStages={SUBMIT_STAGES} stageOpacity={stageOpacity} stageTranslateY={stageTranslateY} stageCheckScale={stageCheckScale} />;
      case 5:
        return <StepStatus trackingCode={trackingCode} trackingSnapshot={trackingSnapshot} trackingStatusError={trackingStatusError} isRefreshingStatus={isRefreshingStatus} fetchTrackingStatus={fetchTrackingStatus} onRestart={handleRestart} />;
      default:
        return null;
    }
  };

  const handleRestart = () => {
    clearPollingTimer();
    setCurrentStep(1);
    setInformalContext('');
    setFormalLetter('');
    setPhotos([]);
    setPersonalData({ fullName: '', idNumber: '', email: '', phone: '' });
    setTrackingCode('');
    setTrackingSnapshot(null);
    setTrackingStatusError('');
  };

  if (!fontsLoaded) {
    return <View style={styles.loader}><ActivityIndicator size="large" color="#0e766e" /></View>;
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
        <ScrollView contentContainerStyle={styles.contentContainer}>{renderStep()}</ScrollView>
        {currentStep < 5 ? (
          <View style={styles.footerActions}>
            {currentStep > 1 ? (
              <Pressable style={styles.secondaryAction} onPress={() => setCurrentStep((p) => p - 1)}>
                <Text style={styles.secondaryActionText}>Atrás</Text>
              </Pressable>
            ) : <View />}
            {currentStep === 4 ? (
              <Pressable style={[styles.primaryAction, (!canContinue || isSubmitting) && styles.primaryDisabled]} disabled={!canContinue || isSubmitting} onPress={handleSend}>
                <Text style={styles.primaryActionText}>{isSubmitting ? 'Enviando...' : 'Enviar y Radicar'}</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.primaryAction, !canContinue && styles.primaryDisabled]} disabled={!canContinue} onPress={() => setCurrentStep((p) => Math.min(p + 1, TOTAL_STEPS))}>
                <Text style={styles.primaryActionText}>Continuar</Text>
              </Pressable>
            )}
          </View>
        ) : null}
        <AppNoticeModal appNotice={appNotice} onClose={() => setAppNotice((prev) => ({ ...prev, visible: false }))} />
      </SafeAreaView>
    </LinearGradient>
  );
}

export default Sentry.wrap(App);
