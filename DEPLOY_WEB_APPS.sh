#!/bin/bash

echo "🚀 TORC Demo Release - Vercel Deployment"
echo "========================================"
echo ""
echo "Apps:"
echo "  ✅ Website + Admin (/admin)"
echo "  ✅ Customer Web"
echo "  ✅ Provider Web"
echo ""
echo "Ports (local dev):"
echo "  - Customer: http://localhost:7010"
echo "  - Provider: http://localhost:7001"
echo "  - Website:  http://localhost:8083"
echo ""

# Function to deploy an app
deploy_app() {
    local app_name=$1
    local app_path=$2
    
    echo "📦 Deploying $app_name..."
    echo "   Path: $app_path"
    cd "$app_path" || exit 1
    vercel --prod --yes
    echo ""
    echo "✅ $app_name deployed!"
    echo ""
}

# Ask which app to deploy
echo "Which app would you like to deploy?"
echo ""
echo "1) Website + Admin"
echo "2) Customer Web"
echo "3) Provider Web"
echo "4) All apps (recommended)"
echo ""
read -p "Enter choice (1, 2, 3, or 4): " choice

BASE_PATH="/Users/bajideace/Desktop/torc/apps"

case $choice in
    1)
        deploy_app "Website + Admin" "$BASE_PATH/website"
        ;;
    2)
        deploy_app "Customer Web" "$BASE_PATH/customer-web"
        ;;
    3)
        deploy_app "Provider Web" "$BASE_PATH/provider-web"
        ;;
    4)
        deploy_app "Website + Admin" "$BASE_PATH/website"
        deploy_app "Customer Web" "$BASE_PATH/customer-web"
        deploy_app "Provider Web" "$BASE_PATH/provider-web"
        echo "🎉 All apps deployed successfully!"
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "🎊 Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Copy production URLs from Vercel output/dashboard"
echo "  2. Set env vars in each project:"
echo "     - VITE_SUPABASE_URL"
echo "     - VITE_SUPABASE_ANON_KEY"
echo "     - VITE_GOOGLE_MAPS_API_KEY (customer/provider)"
echo "     - VITE_STRIPE_PUBLISHABLE_KEY (customer)"
echo "     - VITE_APP_URL (each app's public URL)"
echo "  3. Redeploy after env vars are set"
echo "  4. Share demo links"
echo ""
