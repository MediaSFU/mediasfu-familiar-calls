import React from 'react';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const ICONS = {
  'arrow-right': 'arrow-right',
  'chevron-right': 'chevron-right',
  'phone-plus': 'phone-plus',
  'video-outline': 'video-outline',
  video: 'video',
  'video-off': 'video-off',
  'phone-outline': 'phone-outline',
  'phone-log-outline': 'phone-log-outline',
  microphone: 'microphone',
  'microphone-off': 'microphone-off',
  'camera-switch': 'camera-switch',
  'monitor-share': 'monitor-share',
  'view-dashboard-outline': 'view-dashboard-outline',
};

const FALLBACK_ICON = 'help-circle-outline';

export default function ShellIcon({ name, size = 20, color = '#237446' }) {
  return (
    <MaterialCommunityIcons
      accessible={false}
      name={ICONS[name] || FALLBACK_ICON}
      size={size}
      color={color}
    />
  );
}