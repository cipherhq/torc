const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Ensure Metro resolves from mobile's node_modules first, then root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Singleton packages that must only have ONE copy in the bundle.
// Without this, the root monorepo's react@18 gets bundled alongside
// the mobile's react@19, causing "Invalid hook call" errors.
const singletonPkgs = ['react', 'react-dom', 'react-native'];
const mobileNodeModules = path.resolve(projectRoot, 'node_modules');

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Redirect both exact matches (e.g. "react") and sub-path imports
  // (e.g. "react/jsx-runtime", "react-native/Libraries/...") to the
  // mobile app's node_modules, preventing the root's react@18 from leaking in.
  for (const pkg of singletonPkgs) {
    if (moduleName === pkg || moduleName.startsWith(pkg + '/')) {
      const redirected = path.join(mobileNodeModules, moduleName);
      return context.resolveRequest(
        { ...context, originModulePath: redirected },
        moduleName,
        platform,
      );
    }
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
