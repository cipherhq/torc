#!/bin/bash

echo "🧪 Starting TORC Web Apps for Local Testing"
echo "=========================================="
echo ""
echo "This will start:"
echo "  📱 Customer Web → http://localhost:7000"
echo "  🚗 Provider Web → http://localhost:7001"
echo ""
echo "Opening in separate terminal windows..."
echo ""

# Start customer web app in new terminal
osascript -e 'tell app "Terminal" to do script "cd /Users/bajideace/Desktop/torc/apps/customer-web && echo \"🧪 Starting Customer Web App...\" && npm run dev"'

# Wait a moment
sleep 2

# Start provider web app in new terminal
osascript -e 'tell app "Terminal" to do script "cd /Users/bajideace/Desktop/torc/apps/provider-web && echo \"🧪 Starting Provider Web App...\" && npm run dev"'

echo "✅ Apps starting in new terminal windows!"
echo ""
echo "📱 Once they're running:"
echo "   Customer: http://localhost:7000"
echo "   Provider: http://localhost:7001"
echo ""
echo "🧪 Test Flow:"
echo "   1. Open customer app (localhost:7000)"
echo "   2. Sign up / log in as customer"
echo "   3. Create a job request"
echo "   4. Open provider app (localhost:7001)"
echo "   5. Sign up / log in as provider"
echo "   6. Accept the job"
echo "   7. Watch real-time updates on customer side!"
echo ""
echo "💡 When done testing, press Ctrl+C in each terminal to stop"
echo ""
