import { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';

/**
 * Hook to manage Bluetooth hardware state for EchoMind AI.
 * Uses InCallManager for modern Android/iOS audio routing.
 */
export const useBluetoothAudio = () => {
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('DEVICE_MIC');
  const [availableDevices, setAvailableDevices] = useState<string[]>([]);

  useEffect(() => {
    if (!NativeModules.InCallManager) {
      console.warn('InCallManager native module not found');
      return;
    }

    // Initialize without starting audio routing immediately to save battery
    // We only start() when we want to force SCO (Bluetooth) or high-quality mic
    InCallManager.start({ media: 'audio', ringback: '' });

    const eventEmitter = new NativeEventEmitter(NativeModules.InCallManager);
    
    const subscription = eventEmitter.addListener('onAudioDeviceChanged', (data) => {
      try {
        const devices = typeof data.availableAudioDeviceList === 'string' 
          ? JSON.parse(data.availableAudioDeviceList) 
          : data.availableAudioDeviceList;
          
        setAvailableDevices(devices || []);
        setDeviceName(data.selectedAudioDevice || 'DEVICE_MIC');
        
        const hasBluetooth = (devices || []).some((d: string) => d.toLowerCase().includes('bluetooth'));
        setIsBluetoothConnected(hasBluetooth);
      } catch (err) {
        console.error('Failed to process audio device state', err);
      }
    });

    return () => {
      subscription.remove();
      InCallManager.stop();
    };
  }, []);

  return {
    isBluetoothConnected,
    deviceName,
    availableDevices,
  };
};

export default useBluetoothAudio;
