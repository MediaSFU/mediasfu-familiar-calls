const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist-web/**', 'node_modules/**'],
    rules: {
      // React Native's Animated and PanResponder APIs intentionally keep
      // mutable handles in refs. These values are consumed by native event
      // handlers and styles, not as React-rendered state.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
