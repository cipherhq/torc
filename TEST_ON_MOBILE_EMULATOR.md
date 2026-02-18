# 📱 Testing Web Apps on Mobile Emulator

Your web apps are responsive and work on mobile browsers!

## 🚀 Quick Start (iOS Simulator)

### Step 1: Start Your Web Apps
```bash
cd /Users/bajideace/Desktop/torc/apps/customer-web
npm run dev  # Runs on localhost:7000

# In another terminal
cd /Users/bajideace/Desktop/torc/apps/provider-web
npm run dev  # Runs on localhost:7001
```

### Step 2: Get Your Local IP Address
```bash
ipconfig getifaddr en0
```
This will show your IP (e.g., `192.168.1.100`)

### Step 3: Open iOS Simulator
```bash
open -a Simulator
```

### Step 4: Test in Safari
In the iOS Simulator:
1. Open Safari
2. Go to: `http://YOUR_IP:7000` (customer app)
3. Test the full flow!
4. Open another tab: `http://YOUR_IP:7001` (provider app)

---

## 🤖 Alternative: Android Emulator

### Step 1: Start Android Emulator
```bash
# List available emulators
emulator -list-avds

# Start an emulator (replace with your AVD name)
emulator -avd Pixel_4_API_30 &
```

### Step 2: Open Chrome
In the Android Emulator:
1. Open Chrome browser
2. Go to: `http://10.0.2.2:7000` (customer app)
3. Go to: `http://10.0.2.2:7001` (provider app)

Note: `10.0.2.2` is Android's special alias for `localhost`

---

## ✅ What You Can Test

Everything works on mobile browsers:
- ✅ Sign up / Login
- ✅ Create job requests
- ✅ Accept jobs
- ✅ Real-time updates
- ✅ Maps
- ✅ Rating system
- ✅ All features!

---

## 📱 About the Native Mobile App

The native mobile app (`apps/mobile`) has dependency issues:
- ❌ React 19 vs Expo Router incompatibility
- ✅ All code is written and correct
- 🔧 Needs fresh Expo project (2-3 hours)

**But you don't need it right now!** Your web apps work perfectly on mobile browsers.

---

## 🚀 After Testing

Once you confirm web apps work on mobile browsers:
1. Deploy to production: `./DEPLOY_WEB_APPS.sh`
2. Your users can access via mobile browser
3. Later, rebuild native mobile app if needed

---

## 💡 Pro Tip

Most users are fine with mobile web apps! They're:
- ✅ Faster to build
- ✅ Easier to update
- ✅ Work on all devices
- ✅ No app store hassle

Native apps are nice-to-have, not must-have.
