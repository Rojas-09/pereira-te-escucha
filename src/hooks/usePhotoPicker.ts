import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

export function usePhotoPicker(maxFiles = 10, maxSizeBytes = 27 * 1024 * 1024) {
  const [photos, setPhotos] = useState<string[]>([]);

  const onPickPhoto = async () => {
    if (photos.length >= maxFiles) {
      return { error: 'Limite de 10 archivos' };
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { error: 'Permiso requerido' };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const fileSize = result.assets[0].fileSize ?? 0;
      if (fileSize > maxSizeBytes) {
        return { error: 'Archivo supera 27 MB' };
      }
      setPhotos(prev => [...prev, result.assets[0].uri]);
    }

    return { error: null };
  };

  return { photos, onPickPhoto };
}
