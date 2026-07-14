import { Modal, Pressable, Text, View } from 'react-native';
import { AppNoticeState } from '../types';
import { styles } from '../styles';

interface AppNoticeProps {
  appNotice: AppNoticeState;
  onClose: () => void;
}

export default function AppNotice({ appNotice, onClose }: AppNoticeProps) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={appNotice.visible}
      onRequestClose={onClose}
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
          <Pressable style={styles.noticeButton} onPress={onClose}>
            <Text style={styles.noticeButtonText}>Entendido</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
