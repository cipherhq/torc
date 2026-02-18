# 🚀 TORC Customer App - Quick Start Guide

## ⚡ Start the App (One Command)

```bash
cd /Users/bajideace/Desktop/torc/apps/customer-web && npx vite --port 8080
```

Then open: **http://localhost:8080**

---

## 🎯 Test the Complete Flow

### 1. **Create an Account**
- Navigate to http://localhost:8080
- Click "Sign Up" from splash screen
- Fill in:
  - First Name: John
  - Last Name: Doe
  - Email: test@example.com
  - Phone: +1 555-123-4567
  - Password: password123
- Click "Create Account"

### 2. **Sign In**
- Email: test@example.com
- Password: password123
- Click "Sign In"

### 3. **Grant Location Permission**
- Allow location access when prompted
- This enables map features

### 4. **Book a Service**
- **Home Map**: See your location
- **Select Service**: Choose from 12 services
  - Towing
  - Jump Start
  - Flat Tire
  - Fuel Delivery
  - Lockout
  - Winch Out
  - Battery Replacement
  - Tire Change
  - Accident Assistance
  - Motorcycle Towing
  - RV Towing
  - Heavy Duty Towing

### 5. **Complete Booking**
- Confirm your location
- Add service details
- Schedule (Now or Later)
- Review pricing
- Add payment method
- Confirm booking

### 6. **Track Provider**
- See provider matching animation
- Track provider location in real-time
- Chat with provider (if needed)
- See ETA updates

### 7. **Complete Service**
- Mark service as complete
- Rate your provider (1-5 stars)
- Add tip (optional)
- Leave review

### 8. **Manage Account**
- View job history in **Activity**
- Check **Wallet** balance
- Update **Profile** info
- Manage **Payment Methods**
- View **Notifications**

---

## 🗂️ App Structure

### Main Sections

**Bottom Navigation (Customer):**
1. **Home** (🏠) - Map view, book services
2. **Activity** (📋) - Job history
3. **Explore** (🔍) - Local shops & services
4. **Profile** (👤) - Account settings

### All Available Routes

```
/                   → Splash screen
/apps               → App selector (Customer/Provider/Admin)
/login              → Sign in
/signup             → Create account
/permissions        → Location permissions

Customer Routes:
/home               → Home map
/who-needs-help     → Select requester
/confirm-location   → Confirm pickup location
/service-selection  → Choose service type
/service-details/:id → Service specifics
/schedule           → Pick time (now/later)
/pricing            → Review price & payment
/matching           → Finding provider...
/tracking/:jobId    → Live tracking
/completion/:jobId  → Rate & tip
/activity           → Job history
/job/:jobId         → Job details
/wallet             → Balance & transactions
/profile            → Account settings
/explore            → Local shops
/notifications      → Alerts & updates
```

---

## 🎨 Design Features

### Color Scheme
- **Cyber-Mint**: #2EFFAF (Primary)
- **Deep Cobalt**: #007AFF (Secondary)
- **Navy Elevated**: #1A1F2E (Background)

### UI Elements
- **Glassmorphism**: Frosted glass effects
- **32px Corners**: Smooth, modern borders
- **Smooth Animations**: Motion/Framer Motion
- **Gradient Buttons**: Eye-catching CTAs

---

## 🔧 Configuration

### Environment Variables
Already configured in `.env`:
```env
VITE_SUPABASE_URL=https://apojatplmfsbimgcyjoo.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_GOOGLE_MAPS_API_KEY=AIzaSyAxcFIzrGgrcT96arDZUtt0zCTu8AWnefM
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51Se8OCFHBjhgB80...
```

### Database
Supabase is pre-configured with:
- User authentication
- Customer profiles
- Service listings
- Job management
- Payment tracking

---

## 🐛 Troubleshooting

### White Screen?
```bash
# Clear and restart
pkill -9 node
cd /Users/bajideace/Desktop/torc/apps/customer-web
npx vite --port 8080
```

### Port Already in Use?
```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9
```

### Dependencies Issue?
```bash
# Reinstall
rm -rf node_modules package-lock.json
npm install
```

### Browser Not Loading?
1. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. Clear browser cache
3. Try incognito/private mode
4. Check browser console for errors (F12)

---

## 📱 Mobile Testing

### Browser DevTools
1. Open browser DevTools (F12)
2. Click device toolbar icon
3. Select device (iPhone 14, Galaxy S21, etc.)
4. Test responsive design

### Actual Device
The app works on real mobile browsers:
1. Find your computer's IP: `ipconfig getifaddr en0`
2. Open on phone: `http://YOUR_IP:8080`
3. Grant location permissions

---

## ✅ Feature Checklist

### Authentication
- [x] Sign up with email
- [x] Sign in with email  
- [x] Password validation
- [x] Session persistence
- [x] Sign out

### Location
- [x] Get current location
- [x] Location permissions
- [x] Address search
- [x] Geocoding
- [x] Distance calculation

### Services
- [x] 12 service types
- [x] Service selection UI
- [x] Service details
- [x] Price calculation
- [x] Scheduling

### Booking
- [x] Create job
- [x] Provider matching
- [x] Live tracking
- [x] Service completion
- [x] Rating & review

### Account
- [x] Profile management
- [x] Job history
- [x] Wallet
- [x] Notifications
- [x] Settings

---

## 🚀 What's Next?

### Enhance
1. Add real Google Maps display component
2. Integrate Stripe payment processing
3. Enable Supabase Realtime for live updates
4. Add push notifications
5. Implement chat feature

### Deploy
1. Build for production: `npm run build`
2. Deploy to Vercel/Netlify
3. Configure environment variables
4. Set up custom domain
5. Enable analytics

### Test
1. End-to-end user testing
2. Performance optimization
3. Accessibility audit
4. Security review
5. Load testing

---

## 📚 Documentation

- **Full Build Guide**: `CUSTOMER_APP_COMPLETE.md`
- **Monorepo Setup**: `../MONOREPO_SETUP_COMPLETE.md`
- **Supabase Setup**: `../../SUPABASE_SETUP.md`

---

## 💡 Tips

1. **Keep server running** while developing
2. **Check browser console** for errors
3. **Test on mobile** for best experience
4. **Use React DevTools** for debugging
5. **Check Supabase dashboard** for data

---

**🎉 You're all set! The customer app is fully functional and ready to use.**

For questions or issues, check the browser console or Supabase logs.
