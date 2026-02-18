#!/bin/bash
echo "🤖 Starting Android Emulator..."
echo ""
echo "This will:"
echo "  1. Start Android Emulator"
echo "  2. Install Expo Go in emulator"
echo "  3. Launch your app"
echo ""
echo "Make sure Android Studio is installed!"
echo "Press Ctrl+C to cancel, or wait 3 seconds to continue..."
sleep 3
cd /Users/bajideace/Desktop/torc/apps/mobile
npx expo start --android
