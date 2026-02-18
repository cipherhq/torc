#!/bin/bash

echo "🚀 TORC Web Apps - Vercel Deployment"
echo "===================================="
echo ""
echo "Your PRODUCTION-READY web apps:"
echo "  ✅ Customer Web (localhost:7000)"
echo "  ✅ Provider Web (localhost:7001)"
echo ""
echo "-----------------------------------"
echo ""

# Function to deploy an app
deploy_app() {
    local app_name=$1
    local app_path=$2
    
    echo "📦 Deploying $app_name..."
    echo "   Path: $app_path"
    cd "$app_path" || exit 1
    vercel --prod
    echo ""
    echo "✅ $app_name deployed!"
    echo ""
}

# Ask which app to deploy
echo "Which app would you like to deploy?"
echo ""
echo "1) Customer Web (for end users)"
echo "2) Provider Web (for service providers)"
echo "3) Both (recommended!)"
echo ""
read -p "Enter choice (1, 2, or 3): " choice

BASE_PATH="/Users/bajideace/Desktop/torc/apps"

case $choice in
    1)
        deploy_app "Customer Web" "$BASE_PATH/customer-web"
        ;;
    2)
        deploy_app "Provider Web" "$BASE_PATH/provider-web"
        ;;
    3)
        deploy_app "Customer Web" "$BASE_PATH/customer-web"
        deploy_app "Provider Web" "$BASE_PATH/provider-web"
        echo "🎉 Both apps deployed successfully!"
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
echo "  1. Visit your Vercel dashboard to see the live URLs"
echo "  2. Test your deployed apps"
echo "  3. Share the links with your users!"
echo ""
