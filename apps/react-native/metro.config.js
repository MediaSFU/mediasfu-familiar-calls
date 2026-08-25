const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

// Native build outputs can appear and disappear while Gradle/CMake runs.
// Keep package JavaScript visible while excluding only generated native trees.
const config = {
  watchFolders: [path.resolve(__dirname, '../../packages/whip-whep-react-native')],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    blockList: [
      defaultConfig.resolver.blockList,
      /[/\\]\.cxx(?:[/\\]|$)/,
      /[/\\]android[/\\]build(?:[/\\]|$)/,
    ],
  },
  server: {
    // RN 0.86's Android downloader can reject Metro's multipart progress
    // stream on Windows before evaluating an otherwise valid bundle. Asking
    // Metro for the plain JavaScript response keeps local emulator reloads
    // deterministic and does not affect release bundles.
    enhanceMiddleware: middleware => (request, response, next) => {
      if (request.url?.includes('.bundle')) {
        request.headers.accept = 'application/javascript';
      }

      return middleware(request, response, next);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
