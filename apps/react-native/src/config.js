// Android emulators reach the host machine through 10.0.2.2.
// Keep MediaSFU credentials in the backend proxy, never in this mobile app.
export const BACKEND_BASE_URL = 'http://10.0.2.2:8787';

export const API_BASE_URL = `${BACKEND_BASE_URL}/api`;
