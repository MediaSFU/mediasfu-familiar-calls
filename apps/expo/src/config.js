import { Platform } from 'react-native';

// The shared backend is the only process that receives reusable MediaSFU
// credentials. Set EXPO_PUBLIC_CALL_API_ORIGIN to a reachable backend origin.
const configuredOrigin = process.env.EXPO_PUBLIC_CALL_API_ORIGIN?.trim();

export const BACKEND_BASE_URL =
  configuredOrigin ||
  (Platform.OS === 'android'
    ? 'http://10.0.2.2:8790'
    : 'http://127.0.0.1:8790');

export const API_BASE_URL = `${BACKEND_BASE_URL}/api`;
