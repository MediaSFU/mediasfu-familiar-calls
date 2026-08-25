const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const hostRoot = path.resolve(__dirname, '..');
const config = getDefaultConfig(projectRoot);
config.watchFolders = [
  path.resolve(__dirname, '../../../packages/whip-whep-react-native'),
  path.resolve(hostRoot, 'node_modules'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(hostRoot, 'node_modules'),
];
module.exports = config;
