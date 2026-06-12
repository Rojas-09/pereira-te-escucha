# Plan 006 — Refactor App.tsx into Hooks/Components

**Finding:** `App.tsx` is ~700+ lines, mixing concerns: UI rendering, state management, API calls, polling logic, geolocation, file handling, form validation, text transformation, and animation. This monolithic structure makes maintenance and testing difficult.
**Category:** Tech Debt / Architecture (Frontend)
**Impact:** HIGH — blocks testability and maintainability
**Effort:** L (Large — careful extraction across multiple files)
**Risk:** MEDIUM — UI refactor, potential for visual regressions
**Evidence:** `App.tsx` (entire file)

---

## Current Architecture

```
App.tsx (~700+ lines)
├── Types (LocationPoint, PersonalData, ResponseMedium, TrackingEvent, TrackingSnapshot)
├── Constants (PQRD_TYPES, TOTAL_STEPS, env-based config)
├── Helper functions:
│   ├── trimTrailingSlashes, resolveApiBaseUrl
│   ├── parseRetryAfterMs, computeBackoffDelayMs
│   ├── fetchWithTimeout, readJsonSafe, buildBackendHeaders
│   ├── formalizeContext (NLP intent detection, keyword matching)
│   ├── formatAddressFromReverseGeocode, buildFormalLetter
│   ├── formatTrackingStatusLabel, shouldContinuePolling, formatStatusDate
│   └── mapTypeToApi, generateSubjectFromMessage, wait, ensureMinStageDuration
├── Polling logic (fetchTrackingStatus, scheduleNextPoll, resetPollingCounters)
├── App() component
│   ├── State (~30 useState calls)
│   ├── Refs (~10 useRef calls)
│   ├── Effects (~8 useEffect calls)
│   ├── Handlers (handleRewrite, handleSend, onPickPhoto, etc.)
│   ├── renderStepContent() ~400 lines (5 screens in one function)
│   └── Main render (~80 lines, layout + navigation)
```

---

## Target Architecture

```
src/
├── App.tsx                      # Entry point, orchestrator
├── config/
│   └── env.ts                   # API_BASE_URL, constants from env
├── types/
│   └── index.ts                 # All types (LocationPoint, PersonalData, etc.)
├── hooks/
│   ├── useLocationPicker.ts     # Geolocation, map press, address resolution
│   ├── usePhotoPicker.ts        # Image picker permission + selection
│   ├── useStatusPolling.ts      # Polling logic (fetch, backoff, cleanup)
│   └── useFormState.ts          # All form state + step management
├── services/
│   ├── api.ts                   # fetchWithTimeout, readJsonSafe, buildBackendHeaders
│   ├── tracking.ts              # fetchTrackingStatus
│   └── submission.ts            # handleSend logic (FormData, multipart)
├── utils/
│   ├── formalizeContext.ts      # NLP intent detection, keyword matching
│   ├── formatters.ts            # formatAddress, formatStatusDate, formatTrackingLabel
│   └── letter.ts                # buildFormalLetter
└── components/
    ├── StepMap.tsx              # Step 1: map + marker
    ├── StepForm.tsx             # Step 2: PQRD type + message + response medium
    ├── StepData.tsx             # Step 3: photos + personal data
    ├── StepReview.tsx           # Step 4: formal letter + rewrite button + submit
    ├── StepTracking.tsx         # Step 5: tracking status + timeline
    ├── SubmitProgress.tsx       # Animated submission progress (extracted from StepReview)
    ├── AppNotice.tsx            # Modal notice component
    └── Header.tsx               # App header + progress bar
```

---

## Step-by-Step Extraction

### Step 1: Create `src/types/index.ts`

Move ALL type definitions from App.tsx:

```ts
export type LocationPoint = {
  latitude: number;
  longitude: number;
};

export type PersonalData = {
  fullName: string;
  idNumber: string;
  email: string;
  phone: string;
};

export type ResponseMedium = 'cartelera' | 'correo_electronico' | 'correo_fisico';
export type SubmitStageStatus = 'pending' | 'active' | 'done';

export type TrackingEvent = {
  to_status: string;
  reason: string | null;
  detail: string | null;
  created_at: string;
};

export type TrackingSnapshot = {
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

export type AppNoticeState = {
  visible: boolean;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'error';
};
```

### Step 2: Create `src/config/env.ts`

Move env-dependent constants:

```ts
import { Platform } from 'react-native';

const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, '');

export const API_BASE_URL = (() => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configuredUrl) return trimTrailingSlashes(configuredUrl);
  if (__DEV__) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
  }
  throw new Error('EXPO_PUBLIC_API_BASE_URL no está configurado...');
})();

export const BACKEND_API_TOKEN = process.env.EXPO_PUBLIC_BACKEND_API_TOKEN?.trim() || '';
export const SUBMIT_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_SUBMIT_TIMEOUT_MS || 45000);
export const STATUS_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_STATUS_TIMEOUT_MS || 7000);
export const STATUS_POLL_BASE_MS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_BASE_MS || 5000);
export const STATUS_POLL_MAX_MS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_MAX_MS || 60000);
export const STATUS_POLL_JITTER_PCT = Math.min(0.5, Math.max(0, Number(process.env.EXPO_PUBLIC_STATUS_POLL_JITTER_PCT || 0.2)));
export const STATUS_POLL_MAX_ELAPSED_MS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_MAX_ELAPSED_MS || 1800000);
export const STATUS_POLL_MAX_ATTEMPTS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_MAX_ATTEMPTS || 40);
export const STATUS_POLL_MAX_CONSECUTIVE_ERRORS = Number(process.env.EXPO_PUBLIC_STATUS_POLL_MAX_CONSECUTIVE_ERRORS || 5);
export const STATUS_RESUME_STALE_MS = Number(process.env.EXPO_PUBLIC_STATUS_RESUME_STALE_MS || 10000);
export const PQRD_TYPES = ['Peticion', 'Queja', 'Reclamo', 'Denuncia', 'Sugerencia'] as const;
```

### Step 3: Create `src/services/api.ts`

```ts
export async function fetchWithTimeout(
  resource: string,
  options: RequestInit,
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function buildBackendHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
```

### Step 4: Create `src/services/tracking.ts`

```ts
import { TrackingSnapshot } from '../types';
import { fetchWithTimeout, readJsonSafe, buildBackendHeaders } from './api';

export type TrackingResult = {
  ok: boolean;
  terminal: boolean;
  statusChanged: boolean;
  retryAfterMs: number | null;
};

export function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) return null;
  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  const retryAt = new Date(retryAfterHeader).getTime();
  if (!Number.isNaN(retryAt)) return Math.max(0, retryAt - Date.now());
  return null;
}

export function computeBackoffDelayMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
  jitterPct: number
): number {
  const exponent = Math.max(0, attempt - 1);
  const rawDelay = Math.min(maxMs, baseMs * (2 ** exponent));
  const jitterFactor = 1 + ((Math.random() * 2 - 1) * jitterPct);
  return Math.max(1000, Math.round(rawDelay * jitterFactor));
}

export async function fetchTrackingStatus(
  code: string,
  apiBaseUrl: string,
  token: string,
  timeoutMs: number
): Promise<{ ok: boolean; terminal: boolean; statusChanged: boolean; retryAfterMs: number | null; snapshot?: TrackingSnapshot }> {
  if (!code) return { ok: false, terminal: true, statusChanged: false, retryAfterMs: null };

  try {
    const response = await fetchWithTimeout(
      `${apiBaseUrl}/api/pqrs/status/${encodeURIComponent(code)}`,
      { method: 'GET', headers: buildBackendHeaders(token) },
      timeoutMs
    );

    if (response.status === 304) return { ok: true, terminal: false, statusChanged: false, retryAfterMs: null };
    if (response.status === 429 || response.status === 503) {
      return { ok: false, terminal: false, statusChanged: false, retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')) };
    }

    const payload = await readJsonSafe<{ ok?: boolean; data?: TrackingSnapshot; message?: string }>(response);
    if (!response.ok || !payload?.ok || !payload?.data) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }

    return { ok: true, terminal: !shouldContinuePolling(payload.data.status), statusChanged: true, retryAfterMs: null, snapshot: payload.data };
  } catch (error) {
    return { ok: false, terminal: false, statusChanged: false, retryAfterMs: null };
  }
}

export function shouldContinuePolling(status: string): boolean {
  return status === 'recibido' || status === 'en_proceso' || status === 'error_temporal';
}
```

### Step 5: Create `src/utils/formatters.ts`

```ts
export function formatAddressFromReverseGeocode(result: { street?: string; streetNumber?: string; district?: string; city?: string; region?: string } | null): string {
  if (!result) return 'Direccion no disponible para este punto.';
  const parts = [result.street, result.streetNumber, result.district, result.city, result.region].filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
  return parts || 'Direccion no disponible para este punto.';
}

export function formatTrackingStatusLabel(status: string): string {
  switch (status) {
    case 'recibido': return 'Recibido';
    case 'en_proceso': return 'En proceso';
    case 'radicado': return 'Radicado';
    case 'error_temporal': return 'Error temporal';
    case 'fallido': case 'fallo': return 'Fallido';
    default: return status;
  }
}

export function formatStatusDate(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function parseRetryAfterMs(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) return null;
  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  const retryAt = new Date(retryAfterHeader).getTime();
  if (!Number.isNaN(retryAt)) return Math.max(0, retryAt - Date.now());
  return null;
}

export function generateSubjectFromMessage(message: string, type: string): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  const firstSlice = compact.slice(0, 80);
  return firstSlice ? `${type}: ${firstSlice}` : `${type}: Solicitud ciudadana`;
}

export function mapTypeToApi(value: string): string {
  const n = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (n === 'peticion') return 'peticion';
  if (n === 'queja') return 'queja';
  if (n === 'reclamo') return 'reclamo';
  if (n === 'sugerencia') return 'sugerencia';
  return 'denuncia';
}
```

### Step 6: Create `src/utils/formalizeContext.ts`

Move the entire `formalizeContext` function and its `intents` array to this file (it's ~100+ lines).

### Step 7: Create `src/utils/letter.ts`

```ts
import { LocationPoint, PersonalData } from '../types';
import { formalizeContext } from './formalizeContext';

export function buildFormalLetter(args: {
  type: string;
  informalContext: string;
  personalData: PersonalData;
  point: LocationPoint | null;
}): string {
  const dateText = new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const locationText = args.point
    ? `ubicada en las coordenadas (${args.point.latitude.toFixed(6)}, ${args.point.longitude.toFixed(6)})`
    : 'descrita por el ciudadano';

  const rewrittenContext = formalizeContext(args.informalContext);

  return `Pereira, ${dateText}\n\n...`; // full letter template
}
```

### Step 8: Create hooks

**`src/hooks/useLocationPicker.ts`:**
```ts
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { LocationPoint } from '../types';
import { formatAddressFromReverseGeocode } from '../utils/formatters';

export function useLocationPicker() {
  const [selectedPoint, setSelectedPoint] = useState<LocationPoint | null>(null);
  const [selectedAddress, setSelectedAddress] = useState('Buscando direccion...');
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [locationNotice, setLocationNotice] = useState('');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const location = await Location.getCurrentPositionAsync({});
        setSelectedPoint({ latitude: location.coords.latitude, longitude: location.coords.longitude });
      } catch {
        setLocationNotice('No fue posible obtener la ubicación actual.');
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedPoint) return;
    setIsResolvingAddress(true);
    Location.reverseGeocodeAsync(selectedPoint)
      .then(([result]) => setSelectedAddress(formatAddressFromReverseGeocode(result || null)))
      .catch(() => setSelectedAddress('No se pudo obtener la direccion.'))
      .finally(() => setIsResolvingAddress(false));
  }, [selectedPoint]);

  const onMapPress = (lat: number, lng: number) => setSelectedPoint({ latitude: lat, longitude: lng });

  return { selectedPoint, selectedAddress, isResolvingAddress, locationNotice, onMapPress };
}
```

**`src/hooks/usePhotoPicker.ts`:**
```ts
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

export function usePhotoPicker(maxFiles = 10, maxSizeBytes = 27 * 1024 * 1024) {
  const [photos, setPhotos] = useState<string[]>([]);

  const onPickPhoto = async () => {
    if (photos.length >= maxFiles) return { error: 'Limite de 10 archivos' };

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { error: 'Permiso requerido' };

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!result.canceled && result.assets[0]?.uri) {
      const fileSize = result.assets[0].fileSize ?? 0;
      if (fileSize > maxSizeBytes) return { error: 'Archivo supera 27 MB' };
      setPhotos(prev => [...prev, result.assets[0].uri]);
    }
    return { error: null };
  };

  return { photos, onPickPhoto };
}
```

**`src/hooks/useStatusPolling.ts`:**
This is the most complex hook. It extracts the ~150 lines of polling logic from `App.tsx`:

```ts
import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { fetchTrackingStatus, computeBackoffDelayMs } from '../services/tracking';
import { TrackingSnapshot } from '../types';

interface UseStatusPollingProps {
  trackingCode: string;
  apiBaseUrl: string;
  token: string;
  statusTimeoutMs: number;
  pollBaseMs: number;
  pollMaxMs: number;
  pollJitterPct: number;
  pollMaxElapsedMs: number;
  pollMaxAttempts: number;
  pollMaxConsecutiveErrors: number;
  resumeStaleMs: number;
  onStatusChange: (snapshot: TrackingSnapshot) => void;
  onError: (message: string) => void;
  onTerminal: () => void;
}

export function useStatusPolling({
  trackingCode, apiBaseUrl, token, statusTimeoutMs,
  pollBaseMs, pollMaxMs, pollJitterPct,
  pollMaxElapsedMs, pollMaxAttempts, pollMaxConsecutiveErrors,
  resumeStaleMs, onStatusChange, onError, onTerminal,
}: UseStatusPollingProps) {
  // ... refs for polling state
  // ... useEffect for AppState subscription
  // ... useEffect for starting polling when trackingCode changes
  // Returns: { isRefreshing, refreshStatus }
}
```

### Step 9: Create components

Each screen step becomes its own component file. For example `src/components/StepMap.tsx`:

```tsx
import { Platform, View, Text } from 'react-native';
import MapView, { MapPressEvent, Marker, Region } from 'react-native-maps';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

interface StepMapProps {
  region: Region;
  selectedPoint: { latitude: number; longitude: number } | null;
  selectedAddress: string;
  isResolvingAddress: boolean;
  locationNotice: string;
  androidMapHtml: string;
  onMapPress: (event: MapPressEvent) => void;
  onAndroidMapMessage: (event: WebViewMessageEvent) => void;
}

export function StepMap({ region, selectedPoint, selectedAddress, isResolvingAddress, locationNotice, androidMapHtml, onMapPress, onAndroidMapMessage }: StepMapProps) {
  return (
    <View>
      {/* Step 1 UI from App.tsx */}
    </View>
  );
}
```

### Step 10: Simplify `App.tsx`

After extraction, `App.tsx` becomes an orchestrator:

```tsx
import { useState, useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';

import { API_BASE_URL, BACKEND_API_TOKEN, SUBMIT_TIMEOUT_MS, STATUS_TIMEOUT_MS, /* ... */ PQRD_TYPES } from './config/env';
import { AppNoticeState, ResponseMedium, PersonalData, SubmitStageStatus } from './types';
import { useLocationPicker } from './hooks/useLocationPicker';
import { usePhotoPicker } from './hooks/usePhotoPicker';
import { StepMap, StepForm, StepData, StepReview, StepTracking } from './components';
import { AppNotice } from './components/AppNotice';
import { styles } from './styles';

export default function App() {
  const [fontsLoaded] = useFonts({ Sora_400Regular, Sora_600SemiBold, Sora_700Bold });
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedType, setSelectedType] = useState('Peticion');
  const [responseMedium, setResponseMedium] = useState<ResponseMedium>('correo_electronico');
  const [informalContext, setInformalContext] = useState('');
  const [formalLetter, setFormalLetter] = useState('');
  const [personalData, setPersonalData] = useState<PersonalData>({ fullName: '', idNumber: '', email: '', phone: '' });
  const [appNotice, setAppNotice] = useState<AppNoticeState>({ visible: false, title: '', message: '', tone: 'info' });

  const location = useLocationPicker();
  const photo = usePhotoPicker();

  // Each component receives only the props it needs
  // Step rendering via switch/case or object lookup
  // Main render remains clean and readable

  if (!fontsLoaded) {
    return <View style={styles.loader}><ActivityIndicator size="large" color="#0e766e" /></View>;
  }

  return (
    <LinearGradient colors={['#e8f7f2', '#ecf8ff', '#fffaf0']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <Header currentStep={currentStep} totalSteps={5} />
        <ScrollView contentContainerStyle={styles.contentContainer}>
          {currentStep === 1 && <StepMap {...location} region={region} />}
          {currentStep === 2 && <StepForm selectedType={selectedType} onTypeChange={setSelectedType} ... />}
          {currentStep === 3 && <StepData {...photo} personalData={personalData} onPersonalDataChange={setPersonalData} ... />}
          {currentStep === 4 && <StepReview formalLetter={formalLetter} onLetterChange={setFormalLetter} ... />}
          {currentStep === 5 && trackingCode && <StepTracking ... />}
        </ScrollView>
        {currentStep < 5 && <FooterActions currentStep={currentStep} onBack={() => setCurrentStep(s => s - 1)} onNext={() => setCurrentStep(s => s + 1)} />}
      </SafeAreaView>
      {appNotice.visible && <AppNotice {...appNotice} onClose={() => setAppNotice(v => ({ ...v, visible: false }))} />}
    </LinearGradient>
  );
}
```

---

## Verification Gates

```bash
# 1. Check the new file structure
ls src/
# Expected: App.tsx components/ hooks/ services/ utils/ config/ types/

# 2. TypeScript check
npx tsc --noEmit
# Expected: No errors

# 3. Expo development build starts
npx expo start --dev-client --no-bundler
# Expected: Metro bundler starts

# 4. Manual visual check
# All 5 steps render identically to before
# All interactions work: map, form, photos, letter generation, submit, tracking
```

---

## Files in Scope

**Create:**
- `src/config/env.ts`
- `src/types/index.ts`
- `src/services/api.ts`
- `src/services/tracking.ts`
- `src/services/submission.ts`
- `src/utils/formatters.ts`
- `src/utils/formalizeContext.ts`
- `src/utils/letter.ts`
- `src/hooks/useLocationPicker.ts`
- `src/hooks/usePhotoPicker.ts`
- `src/hooks/useFormState.ts`
- `src/hooks/useStatusPolling.ts`
- `src/components/StepMap.tsx`
- `src/components/StepForm.tsx`
- `src/components/StepData.tsx`
- `src/components/StepReview.tsx`
- `src/components/StepTracking.tsx`
- `src/components/SubmitProgress.tsx`
- `src/components/AppNotice.tsx`
- `src/components/Header.tsx`
- `src/styles.ts` (extract StyleSheet from App.tsx)

**Modify:**
- `App.tsx` (strip down to orchestrator, import from new files)

---

## Conventions to Follow
- Each file = one responsibility
- Components receive props explicitly (no implicit state access)
- Hooks return objects (not tuples) for clarity
- Services are pure functions that take parameters (no global state access)
- Styles extracted to `styles.ts` (or kept per-component with StyleSheet.create)
- Existing TypeScript types reused from `types/index.ts`

---

## Test Plan
Manual: navigate through all 5 steps, verify each matches the current behavior.
If tests exist in future (Plan 008), they'd use these extracted services/components.

---

## STOP Conditions
- If the app crashes after refactor, the most likely cause is circular imports or missing StyleSheet definitions — check all imported components receive `style` props correctly
- If navigation between steps breaks, check `currentStep` state management
- If any animation (submission progress) is missing, check that `Animated` values are properly passed
- If `formalizeContext` breaks, the NLP/keyword matching might have import issues — test after extraction
