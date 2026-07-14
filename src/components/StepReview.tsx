import { Animated, Pressable, Text, TextInput, View } from 'react-native';
import { SubmitStageStatus } from '../types';
import { styles } from '../styles';

interface StepReviewProps {
  formalLetter: string;
  setFormalLetter: (text: string) => void;
  handleRewrite: () => void;
  isSubmitting: boolean;
  submitStageStatus: SubmitStageStatus[];
  submitStageDurations: (number | null)[];
  submitStages: string[];
  stageOpacity: Animated.Value[];
  stageTranslateY: Animated.Value[];
  stageCheckScale: Animated.Value[];
}

export default function StepReview({
  formalLetter,
  setFormalLetter,
  handleRewrite,
  isSubmitting,
  submitStageStatus,
  submitStageDurations,
  submitStages,
  stageOpacity,
  stageTranslateY,
  stageCheckScale,
}: StepReviewProps) {
  const completedCount = submitStageStatus.filter((status) => status === 'done').length;
  const activeCount = submitStageStatus.some((status) => status === 'active') ? 1 : 0;
  const progressPercent = ((completedCount + activeCount * 0.45) / submitStages.length) * 100;

  return (
    <View style={styles.stepCard}>
      <Text style={styles.stepTitle}>4. 🪄 Reescritura formal y revisión</Text>
      <Text style={styles.stepHint}>
        Pulsa "Redactar carta" para transformar tu relato informal en redaccion institucional.
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
