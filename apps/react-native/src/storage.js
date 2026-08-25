import AsyncStorage from '@react-native-async-storage/async-storage';

export const IDENTITY_KEY = '@mediasfu/identity';

export async function loadIdentity() {
  const value = await AsyncStorage.getItem(IDENTITY_KEY);
  return value ? JSON.parse(value) : null;
}

export async function saveIdentity(identity) {
  await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}
