import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PersonalData, ResponseMedium } from '../types';
import { styles } from '../styles';

interface StepEvidenceProps {
  photos: string[];
  responseMedium: ResponseMedium;
  personalData: PersonalData;
  setPersonalData: (data: PersonalData | ((prev: PersonalData) => PersonalData)) => void;
  onPickPhoto: () => Promise<void>;
}

export default function StepEvidence({
  photos,
  responseMedium,
  personalData,
  setPersonalData,
  onPickPhoto,
}: StepEvidenceProps) {
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
