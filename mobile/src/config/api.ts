import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// For Expo Go: use your machine's Wi-Fi IP so the phone can reach the server
const DEV_API_URL = Platform.select({
  android: 'http://172.20.10.6:3000/api',
  ios: 'http://172.20.10.6:3000/api',
  default: 'http://172.20.10.6:3000/api',
});

const API_BASE_URL = __DEV__ ? DEV_API_URL : 'https://your-server.com/api';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = await AsyncStorage.getItem('geonex_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint),
  post: <T>(endpoint: string, body: any) => apiRequest<T>(endpoint, { method: 'POST', body }),
  put: <T>(endpoint: string, body: any) => apiRequest<T>(endpoint, { method: 'PUT', body }),
  delete: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
};

export const getBaseUrl = () => __DEV__ ? DEV_API_URL!.replace('/api', '') : 'https://your-server.com';

export default api;
