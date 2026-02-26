#!/bin/bash

echo "🚀 Starting TORC Demo Apps"
echo ""
echo "Opening in new terminal windows..."
echo ""

# Start customer web app
osascript -e 'tell app "Terminal" to do script "cd /Users/bajideace/Desktop/torc/apps/customer-web && npm run dev"'

# Wait a moment
sleep 2

# Start provider web app
osascript -e 'tell app "Terminal" to do script "cd /Users/bajideace/Desktop/torc/apps/provider-web && npm run dev"'

# Wait a moment
sleep 2

# Start website (includes marketing + docs)
osascript -e 'tell app "Terminal" to do script "cd /Users/bajideace/Desktop/torc/apps/website && npm run dev"'

echo "✅ Apps starting!"
echo ""
echo "📱 Access your apps:"
echo "   Customer: http://localhost:7010"
echo "   Provider: http://localhost:7001"
echo "   Website:  http://localhost:8083"
echo ""
echo "🎉 Demo stack is up."
echo ""
echo "💡 Next: test end-to-end, then deploy with: ./DEPLOY_WEB_APPS.sh"
echo ""
