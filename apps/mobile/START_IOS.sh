#!/bin/bash
echo "🍎 Starting iOS Simulator..."
echo ""
echo "This will:"
echo "  1. Open Xcode iOS Simulator"
echo "  2. Install Expo Go in simulator"
echo "  3. Launch your app"
echo ""
echo "Press Ctrl+C to cancel, or wait 3 seconds to continue..."
sleep 3
cd /Users/bajideace/Desktop/torc/apps/mobile
npx expo start --ios
