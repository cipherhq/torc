#!/bin/bash

echo "📱 Testing TORC Web Apps on iOS Simulator"
echo "========================================"
echo ""

# Get local IP
IP=$(ipconfig getifaddr en0)
if [ -z "$IP" ]; then
    IP=$(ipconfig getifaddr en1)
fi

echo "🔍 Your local IP: $IP"
echo ""

# Start apps
echo "🚀 Starting web apps..."
echo ""

# Start customer app in background
cd /Users/bajideace/Desktop/torc/apps/customer-web
npm run dev > /tmp/customer-web.log 2>&1 &
CUSTOMER_PID=$!
echo "   Customer Web starting... (PID: $CUSTOMER_PID)"

# Wait a bit
sleep 3

# Start provider app in background
cd /Users/bajideace/Desktop/torc/apps/provider-web
npm run dev > /tmp/provider-web.log 2>&1 &
PROVIDER_PID=$!
echo "   Provider Web starting... (PID: $PROVIDER_PID)"

# Wait for apps to start
echo ""
echo "⏳ Waiting for apps to start..."
sleep 8

echo ""
echo "✅ Apps should be running now!"
echo ""
echo "📱 Opening iOS Simulator..."
open -a Simulator

echo ""
echo "🌐 In the iOS Simulator, open Safari and go to:"
echo ""
echo "   Customer App: http://$IP:7000"
echo "   Provider App: http://$IP:7001"
echo ""
echo "   (Or use: http://localhost:7000 and http://localhost:7001)"
echo ""
echo "📋 Test Flow:"
echo "   1. Open customer app, sign up/login"
echo "   2. Create a job request"
echo "   3. Open provider app in new Safari tab"
echo "   4. Sign up/login as provider"
echo "   5. Accept the job"
echo "   6. Watch real-time updates! ✨"
echo ""
echo "🛑 To stop the apps, run:"
echo "   kill $CUSTOMER_PID $PROVIDER_PID"
echo ""
echo "   Or just press Ctrl+C"
echo ""

# Save PIDs to file for cleanup
echo "$CUSTOMER_PID" > /tmp/torc-customer-pid
echo "$PROVIDER_PID" > /tmp/torc-provider-pid

# Wait for user to press Ctrl+C
trap "kill $CUSTOMER_PID $PROVIDER_PID 2>/dev/null; echo ''; echo '✅ Apps stopped'; exit 0" INT

echo "Press Ctrl+C to stop the apps when done testing..."
wait
