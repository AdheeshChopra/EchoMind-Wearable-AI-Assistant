declare module 'react-native-incall-manager' {
  export interface StartOptions {
    media?: 'audio' | 'video';
    auto?: boolean;
    ringback?: string;
  }

  export default class InCallManager {
    static start(options?: StartOptions): void;
    static stop(): void;
    static setKeepScreenOn(enable: boolean): void;
    static setSpeakerphoneOn(enable: boolean): void;
    static setForceSpeakerphoneOn(flag: boolean): void;
    static setMicrophoneMute(enable: boolean): void;
  }
}
