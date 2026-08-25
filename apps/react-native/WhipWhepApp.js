import React from 'react';
import { Platform } from 'react-native';
import { FamiliarWhipWhepApp } from '../../packages/whip-whep-react-native/src';

const apiBaseUrl = Platform.select({
  android: 'http://10.0.2.2:8790',
  ios: 'http://127.0.0.1:8790',
  default: 'http://127.0.0.1:8790',
});

export default function App() {
  return <FamiliarWhipWhepApp apiBaseUrl={apiBaseUrl} />;
}
