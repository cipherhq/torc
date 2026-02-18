#!/bin/bash

echo "🚀 TORC Mobile App - Quick Start"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from apps/mobile directory"
    exit 1
fi

echo "📦 Step 1: Installing dependencies..."
npm install

echo ""
echo "✅ Dependencies installed!"
echo ""

echo "📱 Step 2: Choose how to run the app:"
echo ""
echo "  1. iOS Simulator (Mac only)"
echo "  2. Android Emulator"
echo "  3. Expo Go (QR code)"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🍎 Starting iOS simulator..."
        npm run ios
        ;;
    2)
        echo ""
        echo "🤖 Starting Android emulator..."
        npm run android
        ;;
    3)
        echo ""
        echo "📲 Starting Expo Go..."
        echo ""
        echo "1. Install Expo Go app on your phone"
        echo "2. Scan the QR code that appears"
        echo "3. The app will open in Expo Go"
        echo ""
        npm start
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac
