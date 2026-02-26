#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <versionName> <buildNumber>"
  echo "Example: $0 1.0.0 1"
  exit 1
fi

VERSION_NAME="$1"
BUILD_NUMBER="$2"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! [[ "$BUILD_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Error: buildNumber must be a positive integer."
  exit 1
fi

ANDROID_FILES=(
  "$ROOT_DIR/apps/customer-web/android/app/build.gradle"
  "$ROOT_DIR/apps/provider-web/android/app/build.gradle"
)

IOS_FILES=(
  "$ROOT_DIR/apps/customer-web/ios/App/App.xcodeproj/project.pbxproj"
  "$ROOT_DIR/apps/provider-web/ios/App/App.xcodeproj/project.pbxproj"
)

echo "Setting Android/iOS version to versionName=$VERSION_NAME buildNumber=$BUILD_NUMBER"

for file in "${ANDROID_FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing Android file: $file"
    exit 1
  fi

  perl -0pi -e "s/versionCode\\s+\\d+/versionCode $BUILD_NUMBER/g; s/versionName\\s+\"[^\"]+\"/versionName \"$VERSION_NAME\"/g" "$file"
  echo "Updated Android: $file"
done

for file in "${IOS_FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing iOS file: $file"
    exit 1
  fi

  perl -0pi -e "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $VERSION_NAME;/g; s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $BUILD_NUMBER;/g" "$file"
  echo "Updated iOS: $file"
done

echo "Done."
