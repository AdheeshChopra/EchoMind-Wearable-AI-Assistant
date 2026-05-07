const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Exclude heavy or unnecessary folders from Metro
config.resolver.blockList = [
  /.*\.code-review-graph\/.*/,
  /.*\.git\/.*/,
  /.*\.gsd\/.*/,
  /.*\.agent\/.*/,
  /.*\.agents\/.*/,
  /.*\.claude\/.*/,
];

module.exports = withNativeWind(config, { input: './global.css' });

