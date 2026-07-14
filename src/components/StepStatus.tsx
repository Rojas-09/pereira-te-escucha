import { Pressable, Text, View } from 'react-native';
import { TrackingSnapshot } from '../types';
import { formatTrackingStatusLabel, formatStatusDate } from '../utils/formatters';
import { styles } from '../styles';

interface StepStatusProps {
  trackingCode: string;
  trackingSnapshot: TrackingSnapshot | null;
  trackingStatusError: string;
  isRefreshingStatus: boolean;
  fetchTrackingStatus: (code: string, timeoutMs?: number) => void;
  onRestart: () => void;
}

export default function StepStatus({
  trackingCode,
  trackingSnapshot,
  trackingStatusError,
  isRefreshingStatus,
  fetchTrackingStatus,
  onRestart,
}: StepStatusProps) {
  const currentStatus = trackingSnapshot?.status || '';
  const isOfficiallyFiled = currentStatus === 'radicado';
  const hasFailed = currentStatus === 'fallo' || currentStatus === 'fallido';

  return (
    <View style={styles.stepCard}>
      <Text style={styles.stepTitle}>
        {isOfficiallyFiled ? '✅ Radicacion completada' : hasFailed ? '⚠️ Radicacion con novedad' : '🕒 Solicitud recibida'}
      </Text>
      <Text style={styles.successTitle}>
        {isOfficiallyFiled
          ? 'Tu caso ya fue radicado oficialmente.'
          : hasFailed
            ? 'Tu solicitud fue recibida, pero la radicacion no se completo.'
            : 'Tu solicitud fue recibida. Estamos procesando la radicacion.'}
      </Text>
      <Text style={styles.successCode}>{trackingCode}</Text>
      {trackingCode ? <Text style={styles.trackingCodeText}>Codigo de seguimiento: {trackingCode}</Text> : null}
      {trackingSnapshot?.radicadoOficial ? <Text style={styles.trackingCodeText}>Radicado oficial: {trackingSnapshot.radicadoOficial}</Text> : null}
      <Text style={styles.stepHint}>
        Guarda este codigo para seguimiento. Puedes actualizar el estado manualmente o esperar la actualizacion automatica.
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

      <Pressable style={styles.restartButton} onPress={onRestart}>
        <Text style={styles.restartButtonText}>🔁 Radicar otro caso</Text>
      </Pressable>
    </View>
  );
}
