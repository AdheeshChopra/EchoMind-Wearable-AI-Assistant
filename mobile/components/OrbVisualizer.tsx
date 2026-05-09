/**
 * OrbVisualizer — Premium animated orb with 7 capture-state visual modes.
 *
 * States:  idle | passive_listening | speech_detected | recording | processing | saved | error
 *
 * Each state has unique:
 *  - Gradient colors
 *  - Glow intensity/color
 *  - Icon + label text
 *  - Micro-animations (pulse rhythm, glow breathing, ring rotation feel)
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {
  Mic,
  MicOff,
  Radio,
  Ear,
  Loader,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Users,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { VoiceCaptureState, CaptureMode } from '../hooks/useEchoMindVoice';

// ─── State Config ───────────────────────────────────────────────────────────

interface StateVisual {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  gradientColors: readonly [string, string, string];
  glowColor: string;
  dotColor: string;
  borderColor: string;
}

const STATE_VISUALS: Record<VoiceCaptureState, StateVisual> = {
  idle: {
    icon: <MicOff color="rgba(252, 248, 254, 0.5)" size={42} strokeWidth={1.5} />,
    label: 'Tap to start',
    sublabel: 'Ready',
    gradientColors: ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)', 'transparent'],
    glowColor: 'rgba(255, 255, 255, 0.05)',
    dotColor: '#444',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  passive_listening: {
    icon: <Ear color="#a78bfa" size={42} strokeWidth={1.5} />,
    label: 'Listening...',
    sublabel: 'Passive',
    gradientColors: ['rgba(167,139,250,0.10)', 'rgba(139,92,246,0.05)', 'transparent'],
    glowColor: 'rgba(167, 139, 250, 0.15)',
    dotColor: '#a78bfa',
    borderColor: 'rgba(167, 139, 250, 0.25)',
  },
  speech_detected: {
    icon: <Radio color="#c084fc" size={42} strokeWidth={1.5} />,
    label: 'Speech detected',
    sublabel: 'Capturing',
    gradientColors: ['rgba(192,132,252,0.15)', 'rgba(167,139,250,0.08)', 'rgba(74,248,227,0.03)'],
    glowColor: 'rgba(192, 132, 252, 0.25)',
    dotColor: '#c084fc',
    borderColor: 'rgba(192, 132, 252, 0.30)',
  },
  recording: {
    icon: <Mic color="#c799ff" size={44} strokeWidth={1.5} />,
    label: 'Recording...',
    sublabel: 'Recording',
    gradientColors: ['rgba(199,153,255,0.15)', 'rgba(74,248,227,0.08)', 'rgba(199,153,255,0.05)'],
    glowColor: 'rgba(199, 153, 255, 0.30)',
    dotColor: '#4af8e3',
    borderColor: 'rgba(199, 153, 255, 0.35)',
  },
  processing: {
    icon: <Loader color="#4af8e3" size={42} strokeWidth={1.5} />,
    label: 'Processing...',
    sublabel: 'Analyzing',
    gradientColors: ['rgba(74,248,227,0.12)', 'rgba(45,212,191,0.06)', 'transparent'],
    glowColor: 'rgba(74, 248, 227, 0.20)',
    dotColor: '#4af8e3',
    borderColor: 'rgba(74, 248, 227, 0.30)',
  },
  saved: {
    icon: <CheckCircle color="#34d399" size={44} strokeWidth={1.5} />,
    label: 'Memory saved',
    sublabel: 'Saved',
    gradientColors: ['rgba(52,211,153,0.15)', 'rgba(16,185,129,0.08)', 'transparent'],
    glowColor: 'rgba(52, 211, 153, 0.30)',
    dotColor: '#34d399',
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  error: {
    icon: <AlertCircle color="#f87171" size={42} strokeWidth={1.5} />,
    label: 'Error occurred',
    sublabel: 'Error',
    gradientColors: ['rgba(248,113,113,0.12)', 'rgba(239,68,68,0.06)', 'transparent'],
    glowColor: 'rgba(248, 113, 113, 0.20)',
    dotColor: '#f87171',
    borderColor: 'rgba(248, 113, 113, 0.25)',
  },
  consent_required: {
    icon: <ShieldAlert color="#fbbf24" size={42} strokeWidth={1.5} />,
    label: 'Consent needed',
    sublabel: 'Privacy',
    gradientColors: ['rgba(251,191,36,0.12)', 'rgba(245,158,11,0.06)', 'transparent'],
    glowColor: 'rgba(251, 191, 36, 0.20)',
    dotColor: '#fbbf24',
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

  captureState: VoiceCaptureState;
  captureMode?: CaptureMode | null;
  audioLevel?: number;
}

export function OrbVisualizer({
  captureState,
  captureMode,
  audioLevel = 0,
}: OrbVisualizerProps) {
  const visual = STATE_VISUALS[captureState];

  // ─── Shared Values ──────────────────────────────────────────────────────
  const floatY = useSharedValue(0);
  const orbScale = useSharedValue(1);
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.2);
  const ringRotation = useSharedValue(0);
  const processingRotation = useSharedValue(0);
  const pulseRing1 = useSharedValue(0);
  const pulseRing2 = useSharedValue(0);

  // ─── Idle Float ─────────────────────────────────────────────────────────
  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        withTiming(6, { duration: 2800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  // ─── State-Based Animations ─────────────────────────────────────────────
  useEffect(() => {
    switch (captureState) {
      case 'idle':
        orbScale.value = withSpring(1, { damping: 15 });
        glowScale.value = withSpring(1, { damping: 15 });
        glowOpacity.value = withTiming(0.15, { duration: 400 });
        break;

      case 'passive_listening':
        // Gentle breathing glow
        orbScale.value = withSpring(1.02, { damping: 20 });
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.25, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.12, { duration: 1800, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        glowScale.value = withRepeat(
          withSequence(
            withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.0, { duration: 1800, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        // Pulse rings
        pulseRing1.value = 0;
        pulseRing1.value = withRepeat(
          withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }),
          -1,
          false
        );
        pulseRing2.value = 0;
        pulseRing2.value = withDelay(
          1200,
          withRepeat(
            withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }),
            -1,
            false
          )
        );
        break;

      case 'speech_detected':
        orbScale.value = withSpring(1.06, { damping: 10, stiffness: 150 });
        glowOpacity.value = withSpring(0.35, { damping: 12 });
        glowScale.value = withSpring(1.15, { damping: 12 });
        break;

      case 'recording':
        // React to audio level
        const audioScale = 1 + Math.min(audioLevel * 0.25, 0.25);
        orbScale.value = withSpring(audioScale, { damping: 10, stiffness: 130 });
        glowOpacity.value = withSpring(0.35 + audioLevel * 0.35, { damping: 12 });
        glowScale.value = withSpring(1 + audioLevel * 0.3, { damping: 10 });
        break;

      case 'processing':
        orbScale.value = withSpring(1, { damping: 15 });
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.30, { duration: 600, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.15, { duration: 600, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        );
        // Spin the processing icon ring
        processingRotation.value = 0;
        processingRotation.value = withRepeat(
          withTiming(360, { duration: 2000, easing: Easing.linear }),
          -1,
          false
        );
        break;

      case 'saved':
        orbScale.value = withSequence(
          withSpring(1.12, { damping: 8, stiffness: 200 }),
          withSpring(1, { damping: 12 })
        );
        glowOpacity.value = withSequence(
          withTiming(0.5, { duration: 300 }),
          withTiming(0.2, { duration: 1500 })
        );
        break;

      case 'error':
        orbScale.value = withSequence(
          withTiming(0.95, { duration: 100 }),
          withSpring(1, { damping: 8 })
        );
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.30, { duration: 400 }),
            withTiming(0.10, { duration: 400 })
          ),
          3,
          true
        );
        break;
    }
  }, [captureState, audioLevel]);

  // ─── Animated Styles ────────────────────────────────────────────────────

  const animatedFloat = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  const animatedOrb = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
  }));

  const animatedGlow = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const animatedProcessingIcon = useAnimatedStyle(() => ({
    transform: [{ rotate: `${processingRotation.value}deg` }],
  }));

  const animatedPulseRing1 = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pulseRing1.value, [0, 1], [1, 1.8], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(pulseRing1.value, [0, 0.3, 1], [0.3, 0.2, 0], Extrapolation.CLAMP),
  }));

  const animatedPulseRing2 = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pulseRing2.value, [0, 1], [1, 1.8], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(pulseRing2.value, [0, 0.3, 1], [0.3, 0.2, 0], Extrapolation.CLAMP),
  }));

  // ─── Render ─────────────────────────────────────────────────────────────

  const isPassive = captureState === 'passive_listening';
  const isProcessing = captureState === 'processing';

  return (
    <Animated.View style={[styles.wrapper, animatedFloat]}>
      {/* Expanding pulse rings (passive listening) */}
      {isPassive && (
        <>
          <Animated.View
            style={[
              styles.pulseRing,
              { backgroundColor: visual.glowColor },
              animatedPulseRing1,
            ]}
          />
          <Animated.View
            style={[
              styles.pulseRing,
              { backgroundColor: visual.glowColor },
              animatedPulseRing2,
            ]}
          />
        </>
      )}

      {/* Glow ring */}
      <Animated.View
        style={[
          styles.glowRing,
          animatedGlow,
          {
            backgroundColor: visual.glowColor,
            shadowColor: visual.dotColor,
          },
        ]}
      />

      {/* Main orb */}
      <Animated.View style={[styles.orbOuter, animatedOrb]}>
        <View style={[styles.orb, { borderColor: visual.borderColor }]}>
          <LinearGradient
            colors={visual.gradientColors as any}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Inner content */}
          <View style={styles.orbContent}>
            {/* Icon — wrap processing icon with rotation */}
            <View style={styles.iconWrap}>
              {isProcessing ? (
                <Animated.View style={animatedProcessingIcon}>
                  {visual.icon}
                </Animated.View>
              ) : captureMode === 'meeting' && (captureState === 'recording' || captureState === 'idle') ? (
                <Users color={visual.dotColor === '#444' ? "rgba(252, 248, 254, 0.5)" : visual.dotColor} size={42} strokeWidth={1.5} />
              ) : (
                visual.icon
              )}
            </View>

            {/* Status label */}
            <Text
              style={[
                styles.statusText,
                captureState !== 'idle' && styles.statusActive,
              ]}
            >
              {visual.label}
            </Text>

            {/* Dot indicator */}
            <View style={styles.dotRow}>
              <View style={[styles.dot, { backgroundColor: visual.dotColor }]} />
              <Text style={styles.dotLabel}>{visual.sublabel}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 300,
    height: 300,
  },
  pulseRing: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  glowRing: {
    position: 'absolute',
    width: 290,
    height: 290,
    borderRadius: 145,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 50,
    elevation: 10,
  },
  orbOuter: {
    width: 260,
    height: 260,
  },
  orb: {
    flex: 1,
    borderRadius: 130,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    shadowColor: '#c799ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 60,
    elevation: 12,
  },
  orbContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginBottom: 8,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(252, 248, 254, 0.6)',
    letterSpacing: -0.3,
  },
  statusActive: {
    color: '#fcf8fe',
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotLabel: {
    fontSize: 10,
    color: '#777',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
