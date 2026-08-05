#!/bin/bash
set -euo pipefail

# Xcode Cloud post-clone script for TORC Customer iOS (com.torc.customer).
#
# Capacitor iOS uses Swift Package Manager with local package references
# pointing to node_modules/ (e.g., @capacitor/camera, @capacitor/geolocation).
# These don't exist until npm dependencies are installed.
#
# This script runs npm ci at the monorepo root so the SPM packages resolve.

echo "=== TORC Customer iOS: ci_post_clone ==="
echo "CI_WORKSPACE: ${CI_WORKSPACE:-not set}"
echo "PWD: $(pwd)"

# Navigate to the monorepo root.
# Xcode Cloud clones the repo to $CI_WORKSPACE or the current directory.
# The Xcode project is at apps/customer-web/ios/App/ so the root is 4 levels up.
if [ -n "${CI_WORKSPACE:-}" ]; then
  REPO_ROOT="$CI_WORKSPACE"
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

echo "=== Dependencies installed. SPM packages should resolve. ==="
