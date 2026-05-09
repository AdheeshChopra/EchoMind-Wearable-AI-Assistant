import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions, 
  Pressable 
} from 'react-native';
import { OrbVisualizer } from '../../components/OrbVisualizer';
import { VoiceSettingsPanel } from '../../components/VoiceSettingsPanel';
import { 
  Wifi, 
  WifiOff, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Settings as SettingsIcon,
  Zap,
  ZapOff,
  Users,
  Mic,
  MicOff
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEchoMindVoice } from '../../hooks/useEchoMindVoice';
import { EchoMindSocket } from '../../lib/socket';
import { getVoiceSettings } from '../../lib/voiceSettings';
import Animated, { 
  FadeIn, 
  FadeOut, 
  SlideInUp, 
  SlideOutDown,
  useAnimatedStyle,
  withSpring,
  useSharedValue
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function ListenerScreen() {
  const { 
    captureState, 
    captureMode,
    audioLevel, 
    partialTranscript, 
    sentences, 
    error: voiceError,
    enableAutoMode,
    togglePassiveMode,
    startInstantRecord,
    stopInstantRecord,
    disableCapture,
    dismissError,
    startMeetingRecording,
    stopMeetingRecording,
    isUploading
  } = useEchoMindVoice();

  const [isMeetingMode, setIsMeetingMode] = useState(false);

  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [showSettings, setShowSettings] = useState(false);
  const orbScale = useSharedValue(1);

  // Initialize socket and auto-mode if enabled
  useEffect(() => {
    const socket = EchoMindSocket.getInstance();

    const onConnecting = () => setWsStatus('connecting');
    const onConnected = () => {
      setWsStatus('connected');
      // If auto-mode is enabled in settings, start it
      const settings = getVoiceSettings();
      if (settings.autoModeEnabled && captureState === 'idle') {
        enableAutoMode();
      }
    };
    const onDisconnected = () => setWsStatus('disconnected');

    socket.on('connecting', onConnecting);
    socket.on('connected', onConnected);
    socket.on('disconnected', onDisconnected);
    socket.on('reconnect_failed', onDisconnected);

    socket.connect();

    return () => {
      socket.off('connecting', onConnecting);
      socket.off('connected', onConnected);
      socket.off('disconnected', onDisconnected);
      socket.off('reconnect_failed', onDisconnected);
    };
  }, []);

  const handleRetryConnection = useCallback(() => {
    EchoMindSocket.getInstance().retry();
  }, []);

  const handleOrbPress = () => {
    if (isMeetingMode) {
      if (captureState === 'recording') {
        stopMeetingRecording();
      } else if (captureState === 'idle' || captureState === 'passive_listening') {
        startMeetingRecording();
      }
    } else {
      togglePassiveMode();
    }
  };

  const handleOrbLongPress = () => {
    startInstantRecord();
  };

  const handleOrbPressOut = () => {
    if (captureMode === 'manual_instant') {
      stopInstantRecord();
    }
  };

  const latestSentence = sentences.length > 0 ? sentences[sentences.length - 1] : '';
  const displayTranscript = partialTranscript || latestSentence || '';

  const isRecording = captureState === 'recording' || captureState === 'speech_detected';
  const isPassive = captureState === 'passive_listening';
  const isAuto = captureMode === 'auto';

  return (
    <View style={styles.container}>
      {/* Background gradient */}
      <LinearGradient
        colors={['rgba(199, 153, 255, 0.08)', 'rgba(74, 248, 227, 0.04)', 'transparent']}
        style={styles.bgGradient}
      />

      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => setShowSettings(!showSettings)}
          style={styles.iconButton}
        >
          <SettingsIcon color={showSettings ? "#c799ff" : "#acaab0"} size={22} />
        </TouchableOpacity>

        <View style={styles.statusPillContainer}>
          <TouchableOpacity
            style={[
              styles.statusPill,
              wsStatus === 'connected' && styles.statusConnected,
              wsStatus === 'disconnected' && styles.statusDisconnected,
            ]}
            onPress={wsStatus === 'disconnected' ? handleRetryConnection : undefined}
            activeOpacity={wsStatus === 'disconnected' ? 0.7 : 1}
          >
            {wsStatus === 'connected' ? (
              <Wifi color="#4af8e3" size={12} />
            ) : wsStatus === 'connecting' ? (
              <RefreshCw color="#c799ff" size={12} />
            ) : (
              <WifiOff color="#ef4444" size={12} />
            )}
            <Text style={styles.statusText}>
              {wsStatus === 'connected' ? 'SYNCED' : wsStatus === 'connecting' ? 'CONNECTING...' : 'OFFLINE'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          onPress={() => {
            setIsMeetingMode(!isMeetingMode);
            if (captureMode) disableCapture();
          }}
          style={[styles.iconButton, isMeetingMode && styles.iconButtonActive]}
        >
          <Users color={isMeetingMode ? "#4af8e3" : "#acaab0"} size={22} />
        </TouchableOpacity>
      </View>

      {showSettings && (
        <VoiceSettingsPanel 
          onClose={() => setShowSettings(false)} 
          onSettingsChanged={(s) => {
            if (s.autoModeEnabled) enableAutoMode();
            else if (captureMode === 'auto') disableCapture();
          }}
        />
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Orb Container */}
        <View style={styles.orbContainer}>
          <Pressable
            onPress={handleOrbPress}
            onLongPress={handleOrbLongPress}
            onPressOut={handleOrbPressOut}
            delayLongPress={300}
          >
            <OrbVisualizer captureState={captureState} audioLevel={audioLevel} />
          </Pressable>
        </View>

        {/* State Banner */}
        <View style={styles.stateBannerContainer}>
           {voiceError ? (
             <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.errorBanner}>
               <AlertCircle color="#ef4444" size={16} />
               <Text style={styles.errorText}>{voiceError}</Text>
               <TouchableOpacity onPress={dismissError}>
                 <Text style={styles.dismissText}>Dismiss</Text>
               </TouchableOpacity>
             </Animated.View>
           ) : (
             <View style={styles.modeIndicator}>
                <Text style={styles.modeText}>
                  {isMeetingMode ? 'MEETING MODE ACTIVE' :
                   captureMode === 'auto' ? 'AUTO-CAPTURE ACTIVE' : 
                   captureMode === 'manual_passive' ? 'PASSIVE LISTENING' :
                   captureMode === 'manual_instant' ? 'INSTANT RECORD' : 'TAP TO START PASSIVE MODE'}
                </Text>
                <Text style={styles.modeSubtext}>
                  {isMeetingMode ? 
                   (captureState === 'recording' ? 'Recording high-quality audio...' : 'Tap orb to start recording') :
                   captureMode === 'auto' ? 'Monitoring environment...' : 
                   captureMode === 'manual_passive' ? 'Waiting for speech...' :
                   captureMode === 'manual_instant' ? 'Recording now...' : 'Hold orb for instant capture'}
                </Text>
             </View>
           )}
        </View>

        {/* Live Transcript Display */}
        <View style={styles.transcriptContainer}>
          {isRecording ? (
            <Animated.View entering={FadeIn} style={styles.transcriptBox}>
              <Text style={styles.transcriptText}>
                {displayTranscript || '...'}
              </Text>
            </Animated.View>
          ) : captureState === 'processing' || isUploading ? (
            <Animated.View entering={FadeIn} style={styles.processingBox}>
               <RefreshCw color="#c799ff" size={24} style={styles.spin} />
               <Text style={styles.processingText}>
                 {isUploading ? 'Uploading to secure vault...' : 'Syncing memory to neural cloud...'}
               </Text>
            </Animated.View>
          ) : captureState === 'saved' ? (
            <Animated.View entering={FadeIn} style={styles.savedBox}>
               <CheckCircle color="#4af8e3" size={24} />
               <Text style={styles.savedText}>Memory Captured</Text>
            </Animated.View>
          ) : (
            <View style={styles.idleHint}>
              <Text style={styles.idleHintText}>
                "Remember to buy coffee tomorrow"
              </Text>
            </View>
          )}
        </View>

        {/* Recent Activity Feed */}
        {sentences.length > 0 && (
          <View style={styles.feedContainer}>
            <View style={styles.feedHeader}>
              <View style={styles.liveDot} />
              <Text style={styles.feedTitle}>Session Intelligence</Text>
            </View>
            {sentences.slice(-3).reverse().map((s, i) => (
              <Animated.View 
                key={`${i}-${s.substring(0, 5)}`} 
                entering={FadeIn.delay(i * 100)} 
                style={styles.feedItem}
              >
                <Text style={styles.feedText}>{s}</Text>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e12',
  },
  bgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    zIndex: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconButtonActive: {
    backgroundColor: 'rgba(74, 248, 227, 0.1)',
    borderColor: 'rgba(74, 248, 227, 0.3)',
  },
  statusPillContainer: {
    flex: 1,
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusConnected: {
    borderColor: 'rgba(74, 248, 227, 0.3)',
  },
  statusDisconnected: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#acaab0',
    letterSpacing: 1.2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  orbContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  stateBannerContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
    minHeight: 60,
  },
  modeIndicator: {
    alignItems: 'center',
  },
  modeText: {
    color: '#fcf8fe',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  modeSubtext: {
    color: '#777',
    fontSize: 13,
    marginTop: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    gap: 10,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    flex: 1,
  },
  dismissText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  transcriptContainer: {
    marginTop: 30,
    paddingHorizontal: 30,
    minHeight: 120,
    justifyContent: 'center',
  },
  transcriptBox: {
    width: '100%',
  },
  transcriptText: {
    color: '#fcf8fe',
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  processingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  processingText: {
    color: '#c799ff',
    fontSize: 16,
    fontWeight: '600',
  },
  savedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  savedText: {
    color: '#4af8e3',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  idleHint: {
    opacity: 0.3,
  },
  idleHintText: {
    color: '#acaab0',
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  feedContainer: {
    marginTop: 40,
    paddingHorizontal: 24,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4af8e3',
  },
  feedTitle: {
    color: '#4af8e3',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  feedItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  feedText: {
    color: '#acaab0',
    fontSize: 14,
    lineHeight: 20,
  },
  spin: {
    // Rotation handled by reanimated or simple transform if static
  }
});
