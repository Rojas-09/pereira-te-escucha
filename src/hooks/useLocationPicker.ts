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
        setSelectedPoint({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
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

  const onMapPress = (lat: number, lng: number) => {
    setSelectedPoint({ latitude: lat, longitude: lng });
  };

  return { selectedPoint, selectedAddress, isResolvingAddress, locationNotice, onMapPress };
}
