/**
 * Environment configuration for the mobile application.
 * Automatically switches between local development and production URLs.
 */

// Fallback values for local development
const DEV_API_URL = 'http://localhost:8080';
const DEV_WS_URL = 'ws://localhost:8080';

export const ENV = {
  // prioritize EXPO_PUBLIC_ prefix (used by EAS and newer Expo versions)
  API_URL: process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEV_API_URL : ''),
  WS_URL: process.env.EXPO_PUBLIC_WS_URL || (__DEV__ ? DEV_WS_URL : ''),
  IS_PROD: !__DEV__,
};

console.log('[ENV] Initialized with:', {
  API_URL: ENV.API_URL,
  WS_URL: ENV.WS_URL,
  IS_PROD: ENV.IS_PROD
});

export default ENV;
