import { Platform, Text, View } from 'react-native';
import MapView, { MapPressEvent, Marker, Region } from 'react-native-maps';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { LocationPoint } from '../types';
import { styles } from '../styles';

interface StepLocationProps {
  selectedPoint: LocationPoint | null;
  region: Region;
  locationNotice: string;
  selectedAddress: string;
  isResolvingAddress: boolean;
  androidMapHtml: string;
  onMapPress: (event: MapPressEvent) => void;
  onAndroidMapMessage: (event: WebViewMessageEvent) => void;
}

export default function StepLocation({
  selectedPoint,
  region,
  locationNotice,
  selectedAddress,
  isResolvingAddress,
  androidMapHtml,
  onMapPress,
  onAndroidMapMessage,
}: StepLocationProps) {
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
