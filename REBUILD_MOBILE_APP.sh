#!/bin/bash

echo "📱 Rebuilding Mobile App from Scratch"
echo "===================================="
echo ""
echo "This will create a fresh mobile app with your working code."
echo "Estimated time: 2-3 hours"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

cd /Users/bajideace/Desktop/torc

echo ""
echo "Step 1: Backup existing mobile app..."
mv apps/mobile apps/mobile-backup-$(date +%Y%m%d-%H%M%S)

echo "Step 2: Create fresh Expo app..."
npx create-expo-app@latest apps/mobile --template blank

cd apps/mobile

echo "Step 3: Install dependencies..."
npx expo install expo-router expo-device expo-notifications expo-location react-native-maps
npm install @supabase/supabase-js

echo "Step 4: Copy your working code..."
cp -r ../mobile-backup-*/contexts ./
cp -r ../mobile-backup-*/utils ./
cp -r ../mobile-backup-*/lib ./

echo "Step 5: Copy app screens..."
mkdir -p app/auth app/provider app/customer
cp -r ../mobile-backup-*/app/auth/* ./app/auth/ 2>/dev/null || true
cp -r ../mobile-backup-*/app/provider/* ./app/provider/ 2>/dev/null || true
cp -r ../mobile-backup-*/app/customer/* ./app/customer/ 2>/dev/null || true

echo ""
echo "✅ Mobile app rebuilt!"
echo ""
echo "Next steps:"
echo "1. Update app.json with your configuration"
echo "2. Test: cd apps/mobile && npx expo start --ios"
echo ""
echo "Full guide in: MOBILE_APP_REBUILD_GUIDE.md"
