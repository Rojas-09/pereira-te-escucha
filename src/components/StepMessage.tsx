import { Pressable, Text, TextInput, View } from 'react-native';
import { PQRD_TYPES } from '../config/env';
import { ResponseMedium } from '../types';
import { styles } from '../styles';

interface StepMessageProps {
  selectedType: string;
  setSelectedType: (type: string) => void;
  responseMedium: ResponseMedium;
  setResponseMedium: (medium: ResponseMedium) => void;
  informalContext: string;
  setInformalContext: (text: string) => void;
}

export default function StepMessage({
  selectedType,
  setSelectedType,
  responseMedium,
  setResponseMedium,
  informalContext,
  setInformalContext,
}: StepMessageProps) {
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
        placeholder="Ejemplo: Que vuelta con los mismos huecos de siempre..."
        placeholderTextColor="#8f8f8f"
        style={styles.textArea}
      />
      <Text style={styles.counterText}>Mínimo sugerido: 15 caracteres</Text>
    </View>
  );
}
