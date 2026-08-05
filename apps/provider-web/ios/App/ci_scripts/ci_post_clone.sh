#!/bin/bash
set -euo pipefail

# Xcode Cloud post-clone script for TORC Provider iOS (com.torc.provider).
# Xcode project location: apps/provider-web/ios/App/
#
# Capacitor iOS uses Swift Package Manager with local package references
# pointing to node_modules/ (e.g., @capacitor/camera, @capacitor/geolocation).
# These don't exist until npm dependencies are installed.
#
# This script:
# 1. Runs npm ci at the monorepo root so SPM packages resolve.
# 2. Builds the provider web app (vite build).
# 3. Runs cap sync ios to copy built assets and generate Cordova compat files.

echo "=== TORC Provider iOS: ci_post_clone ==="
echo "CI_PRIMARY_REPOSITORY_PATH: ${CI_PRIMARY_REPOSITORY_PATH:-not set}"
echo "PWD: $(pwd)"

# Navigate to the monorepo root.
# Xcode Cloud sets CI_PRIMARY_REPOSITORY_PATH to the cloned repo.
# Fallback: the Xcode project is at apps/provider-web/ios/App/ so root is 4 levels up.
if [ -n "${CI_PRIMARY_REPOSITORY_PATH:-}" ]; then
  REPO_ROOT="$CI_PRIMARY_REPOSITORY_PATH"
else
  REPO_ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
fi

echo "Repo root: $REPO_ROOT"

if [ ! -f "$REPO_ROOT/package.json" ]; then
  echo "ERROR: package.json not found at $REPO_ROOT"
  exit 1
fi

cd "$REPO_ROOT"

# Install Node.js if not available (Xcode Cloud images may not include it)
if ! command -v node &>/dev/null; then
  echo "Node.js not found. Installing via Homebrew..."
  brew install node
fi

echo "Node: $(node --version)"
echo "npm: $(npm --version)"

# Install monorepo dependencies using the frozen lockfile
echo "Running npm ci..."
npm ci

echo "=== Dependencies installed. ==="

# Build the provider web app so dist/ is produced
echo "Building TORC Provider web app..."
npm run build:provider

# Sync Capacitor iOS project (copies dist/ to native assets, generates Cordova compat files)
echo "Syncing TORC Provider Capacitor iOS project..."
cd "$REPO_ROOT/apps/provider-web"
npx cap sync ios

echo "=== Provider iOS build preparation complete. ==="
