# 🧪 Test Your Supabase Connection

Follow these steps to make sure everything is connected properly!

## Step 1: Update Your Anon Key

1. Open `/Users/bajideace/Desktop/torc/.env`
2. Replace `your-anon-key-here` with your actual anon key from Supabase
3. Save the file

Your `.env` should look like:
```env
VITE_SUPABASE_URL=https://apojatplmfsbimgcyjoo.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 2: Install Supabase Package

```bash
npm install @supabase/supabase-js
```

## Step 3: Run the Dev Server

```bash
npm run dev
```

## Step 4: Test in Browser Console

Open your browser to `http://localhost:5173` and open the console (F12), then run:

```javascript
// Test 1: Import and test connection
import { supabase, testConnection } from './src/lib/supabase.js';
await testConnection();

// Test 2: Try to fetch services (will work after you run SQL)
const { data, error } = await supabase.from('services').select('*');
console.log('Services:', data);
```

## Step 5: Run Database Schema

Before Step 4 will fully work, you need to create the database tables:

1. Go to your Supabase dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Open `SUPABASE_SETUP.md`
5. Copy the SQL from **Step 2: Create Enum Types**
6. Paste and click **RUN**
7. Repeat for each SQL section in order:
   - Step 2: Create Enum Types
   - Step 3: Create Core Tables
   - Step 4: Create Indexes
   - Step 5: Create Functions
   - Step 6: Set Up RLS
   - Step 7: Insert Services

## Step 6: Verify Tables Created

In Supabase dashboard:
1. Click **Table Editor**
2. You should see all tables:
   - profiles
   - customers
   - providers
   - services
   - jobs
   - payments
   - documents
   - notifications
   - etc.

## Step 7: Test Services Query

Back in browser console:

```javascript
import { getAllServices } from './src/services/services.service.js';
const { data, error } = await getAllServices();
console.log('All Services:', data);
// Should show 12 services (Towing, Jump Start, etc.)
```

## ✅ Connection Successful!

If you see the 12 services, you're all set! Your Torc app is now connected to Supabase! 🎉

## Next Steps

1. ✅ Database connected
2. → Implement authentication in UI
3. → Test job creation
4. → Set up real-time updates
5. → Create mobile app

## Troubleshooting

### Error: "Missing Supabase environment variables"
- Make sure `.env` file exists
- Make sure keys are correct (no spaces, no quotes)
- Restart dev server after changing `.env`

### Error: "relation does not exist"
- You haven't run the database schema yet
- Go to Supabase SQL Editor and run all SQL from SUPABASE_SETUP.md

### Error: "Invalid API key"
- Check that you copied the correct key from Project Settings → API
- Use the `anon` `public` key, not the `service_role` key

### Services query returns empty array
- Run Step 7 from SUPABASE_SETUP.md (Insert Services)
- Make sure the SQL ran successfully

---

**Need help?** Just ask! 😊
