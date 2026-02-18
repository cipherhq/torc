# 🚨 CRITICAL: Customer & Provider Apps Audit

**Date:** February 17, 2026  
**Status:** ⚠️ APPS NOT USING NEW RPCs!

---

## 🔴 CRITICAL ISSUES

### 1. **Provider App NOT Using `accept_job()` RPC** ⚠️⚠️⚠️

**File:** `apps/provider-web/src/pages/provider/JobRequest.tsx` (lines 152-162)

**Current Code (BROKEN):**
```typescript
// ❌ WRONG - Direct database update, NO race protection!
const { data: updatedJob, error: updateError } = await supabase
  .from('jobs')
  .update({
    provider_id: user.id,
    status: 'accepted',
    accepted_at: new Date().toISOString(),
  })
  .eq('id', requestId)
  .is('provider_id', null)  // ⚠️ Not atomic! Race condition possible!
  .select()
  .single();
```

**Problems:**
- ❌ NO atomic row-level locking (`FOR UPDATE`)
- ❌ Multiple providers CAN accept same job
- ❌ NO `pg_notify` for push notifications
- ❌ NO event logging to `job_events` table
- ❌ Worker won't know to send pushes!

**Required Fix:**
```typescript
// ✅ CORRECT - Use atomic RPC
const { data, error } = await supabase.rpc('accept_job', {
  p_job_id: requestId,
  p_provider_id: user.id
});

if (error || !data.success) {
  // Job was already accepted by another provider
  console.warn('Job already taken:', data?.error);
  navigate('/home');
  return;
}

// Success! Job is atomically claimed
// Push worker will automatically notify customer
```

---

### 2. **Customer App NOT Using `cancel_job()` RPC** ⚠️⚠️

**File:** `apps/customer-web/src/context/JobContext.jsx` (lines 151-183)

**Current Code (BROKEN):**
```javascript
// ❌ WRONG - Direct update, no authorization checks!
const { data, error } = await supabase
  .from('jobs')
  .update({ 
    status: 'cancelled',
    cancellation_reason: reason,
    cancelled_at: new Date().toISOString(),
  })
  .eq('id', jobId)
  .select()
  .single();
```

**Problems:**
- ❌ NO server-side authorization (RLS might allow wrong user to cancel)
- ❌ NO `pg_notify` for push notifications
- ❌ NO event logging
- ❌ Missing `cancelled_by` tracking
- ❌ Provider won't get notification!

**Required Fix:**
```javascript
// ✅ CORRECT - Use atomic RPC
async function cancelJob(jobId, reason) {
  if (!user) throw new Error('Not authenticated');
  
  const { data, error } = await supabase.rpc('cancel_job', {
    p_job_id: jobId,
    p_actor_id: user.id,
    p_actor_type: 'customer',
    p_reason: reason
  });

  if (error) throw error;
  
  if (!data.success) {
    throw new Error(data.message || 'Cancellation failed');
  }

  // Refetch enriched job data
  await fetchJob(jobId);
  return data;
}
```

---

### 3. **Provider App NOT Using `cancel_job()` RPC** ⚠️⚠️

**File:** `apps/provider-web/src/context/JobContext.jsx` (lines 139-170)

**Same issue as customer app** - needs to use `cancel_job()` RPC with `actor_type: 'provider'`

---

### 4. **Missing Real-Time Subscriptions** ⚠️

**Files:** Both `JobContext.jsx` files

**Missing Feature:**
```javascript
// ✅ ADD THIS to JobContext
function subscribeToJobUpdates(jobId, callback) {
  if (!jobId) return () => {};
  
  const channel = supabase
    .channel(`job-updates-${jobId}`)
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'jobs', 
        filter: `id=eq.${jobId}` 
      },
      async () => {
        await fetchJob(jobId);
        callback?.();
      }
    )
    .subscribe();
  
  return () => { supabase.removeChannel(channel); };
}

// Export in value object
const value = {
  // ... existing exports
  subscribeToJobUpdates,
  fetchProviderStats  // Also add this for provider stats
};
```

---

### 5. **Customer Tracking Page NOT Using Subscriptions** ⚠️

**File:** `apps/customer-web/src/pages/customer/Matching.tsx`

**Current:** Uses broadcasts only (unreliable for persistent updates)

**Required:** Add `subscribeToJobUpdates` from JobContext

```typescript
// ✅ ADD to Matching.tsx or LiveTracking.tsx
useEffect(() => {
  if (!createdJobId) return;
  
  const unsubscribe = subscribeToJobUpdates(createdJobId, () => {
    // Job updated - UI will refresh via currentJob state
    console.log('Job updated via postgres_changes');
  });
  
  return () => unsubscribe();
}, [createdJobId]);
```

---

### 6. **Missing Provider Stats Calculation** ⚠️

**Files:** Both `JobContext.jsx` files

**Current:** No way to show provider's completed jobs count or average rating

**Required:**
```javascript
async function fetchProviderStats(providerId) {
  if (!providerId) return null;
  
  const { data: completedJobs } = await supabase
    .from('jobs')
    .select('id, rating')
    .eq('provider_id', providerId)
    .eq('status', 'completed');
  
  const count = completedJobs?.length ?? 0;
  const withRating = (completedJobs || []).filter(j => j.rating != null);
  const avgRating = withRating.length > 0
    ? withRating.reduce((s, j) => s + Number(j.rating), 0) / withRating.length
    : null;
  
  return { completedCount: count, averageRating: avgRating };
}
```

---

### 7. **Missing Post-Update Refetching** ⚠️

**Files:** Both `JobContext.jsx` files

**Problem:** After updating job status/rating, not refetching enriched data

**Required:** Add `await fetchJob(jobId)` after all mutations:
```javascript
async function updateJobStatus(jobId, status) {
  const { error } = await supabase
    .from('jobs')
    .update({ status })
    .eq('id', jobId);
  
  if (error) throw error;
  
  // ✅ REQUIRED: Refetch with all relationships
  await fetchJob(jobId);
}

async function rateJob(jobId, rating, review) {
  const { error } = await supabase
    .from('jobs')
    .update({ rating, review, reviewed_at: new Date().toISOString() })
    .eq('id', jobId);
  
  if (error) throw error;
  
  // ✅ REQUIRED: Refetch
  await fetchJob(jobId);
}
```

---

## 📋 Complete Fix Checklist

### Provider App:
- [ ] Update `JobRequest.tsx` to use `accept_job()` RPC (CRITICAL)
- [ ] Update `JobContext.jsx` to use `cancel_job()` RPC
- [ ] Add `subscribeToJobUpdates` to JobContext
- [ ] Add `fetchProviderStats` to JobContext
- [ ] Add post-update refetching in all mutations
- [ ] Update UI to handle RPC response format

### Customer App:
- [ ] Update `JobContext.jsx` to use `cancel_job()` RPC
- [ ] Add `subscribeToJobUpdates` to JobContext
- [ ] Add `fetchProviderStats` to JobContext
- [ ] Update `Matching.tsx` / `LiveTracking.tsx` to use subscriptions
- [ ] Add post-update refetching in all mutations
- [ ] Ensure tracking page uses real-time updates

---

## 🎯 Impact of Not Fixing

### If Provider App Continues Direct Updates:
- ❌ **Race conditions WILL occur** (multiple providers accept same job)
- ❌ Customers won't get push notifications
- ❌ No audit trail of actions
- ❌ System will appear broken to users

### If Customer App Continues Direct Updates:
- ❌ Providers won't get cancellation notifications
- ❌ No audit trail
- ❌ Authorization bypassed (anyone could cancel any job with RLS misconfiguration)

---

## 🚀 Priority Order

**Must Fix Immediately (Production Blockers):**
1. Provider `accept_job()` RPC integration
2. Customer/Provider `cancel_job()` RPC integration

**Should Fix Soon (UX Issues):**
3. Real-time subscriptions
4. Provider stats calculation
5. Post-update refetching

**Nice to Have:**
6. Better error handling
7. Loading states
8. Retry logic

---

## 💡 Testing After Fixes

### Test Provider Acceptance:
```bash
# Terminal 1: Start push worker
cd ~/Desktop/torc/workers
node push-notification-worker.js

# Terminal 2: Run race test
cd ~/Desktop/torc/scripts
npm run test:race
```

**Expected:** Worker logs show "📨 Received event: job_accepted"

### Test in Apps:
1. Customer creates job
2. Provider accepts → Customer gets push (if mobile integrated)
3. Customer cancels → Provider gets push
4. Check `job_events` table for audit trail

---

## 📁 Files to Modify

```
apps/
├── provider-web/
│   ├── src/context/JobContext.jsx        ⚠️ UPDATE
│   └── src/pages/provider/JobRequest.tsx ⚠️ CRITICAL UPDATE
└── customer-web/
    ├── src/context/JobContext.jsx        ⚠️ UPDATE
    └── src/pages/customer/Matching.tsx   ⚠️ ADD SUBSCRIPTIONS
```

---

**Status:** 🔴 CRITICAL FIXES REQUIRED BEFORE PRODUCTION

**Next Step:** Start with provider `accept_job()` integration - it's the most critical!
