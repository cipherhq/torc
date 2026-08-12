# Stripe External Data Audit — Account Deletion Impact

**Audit Date:** 2026-08-12
**Scope:** What TORC stores externally in Stripe and deletion implications

---

## Stripe Objects Created by TORC

### 1. Stripe Customer

- **Created when:** Customer makes first payment (create-payment-intent edge function)
- **Stored in DB:** `checkouts.stripe_customer_id`
- **Contains:** Email, name, metadata
- **Current deletion behavior:** DB row deleted, Stripe Customer object **NOT deleted via API**

### 2. PaymentMethods

- **Created when:** Customer saves card during checkout
- **Stored in DB:** `checkouts.payment_method_id`
- **Attached to:** Stripe Customer
- **Current deletion behavior:** DB reference deleted, PaymentMethod **NOT detached via Stripe API**

### 3. PaymentIntents

- **Created when:** Each checkout / tip
- **Contains:** Amount, customer ID, payment method, metadata (job_id, customer_id)
- **Stored in DB:** `jobs.payment_intent_id`
- **Status:** succeeded, requires_action, canceled, etc.

### 4. Charges

- **Created by:** Stripe (automatic with PaymentIntent)
- **Contains:** Amount, receipt, customer info
- **Stripe retention:** Permanent (regulatory)

### 5. Refunds

- **Created when:** Job cancellation triggers refund
- **Contains:** Amount, charge reference, reason
- **Stripe retention:** Permanent (regulatory)

---

## Classification

### A. Can Safely Delete/Detach After Account Deletion

| Item | Action | Safe? | Notes |
|---|---|---|---|
| Stripe Customer object | `stripe.customers.del(id)` | Yes, IF no pending refunds/disputes | Deletes customer, detaches all PaymentMethods |
| Saved PaymentMethods | Detached when Customer deleted | Yes | Automatic with Customer deletion |

### B. Must Retain for Financial Lifecycle

| Item | Why | Duration |
|---|---|---|
| PaymentIntents (succeeded) | Refund window, dispute evidence | Stripe retains automatically |
| Charges | Accounting, audit trail | Stripe retains automatically |
| Refunds | Reconciliation | Stripe retains automatically |

### C. Should Anonymize/Minimize

| Item | Action |
|---|---|
| Customer metadata containing user_id | Update metadata to remove PII after deletion grace period |
| PaymentIntent metadata with customer_id | Consider anonymizing after dispute window closes |

### D. REVIEW REQUIRED

| Item | Decision Needed | Owner |
|---|---|---|
| Stripe Customer deletion timing | When to call `stripe.customers.del()` — immediately on deletion processing, or after a grace period? | Business/Legal |
| Refund window | How long after last payment to retain Stripe Customer for potential refunds? | Business/Legal |
| Dispute evidence | Stripe disputes can arrive up to 120 days after charge. Deleting Customer before dispute window closes could impair defense. | Business/Legal |
| Provider payout records | Provider earnings/payout data in platform — retention period? | Business/Legal/Accounting |
| Receipt emails | Stripe sends receipt emails with customer info — cannot be recalled | Informational |

---

## Recommended Engineering Implementation (Pending Business Decision)

Once business/legal provides retention periods:

1. **Immediate on deletion processing:**
   - Detach all PaymentMethods from Stripe Customer (prevents new charges)

2. **After grace period (e.g., 120 days from last charge):**
   - Delete Stripe Customer object
   - Anonymize PaymentIntent metadata

3. **Implementation approach:**
   - Add Stripe cleanup step to the `finalize-account-deletion` edge function
   - Use Stripe API: `stripe.customers.del(customerId)` or `stripe.paymentMethods.detach(pmId)`
   - Log cleanup actions for audit trail

4. **Safety checks before deletion:**
   - No pending refunds
   - No open disputes
   - Past dispute window (120 days from last charge)
   - No pending payouts to provider

---

## Current Gap

The `process_account_deletion` RPC deletes DB records (`payment_methods`, `stripe_customers` tables) but does **not** make Stripe API calls. This means:

- Stripe Customer object persists externally with user's email/name
- Saved PaymentMethods remain attached and theoretically chargeable
- This is a **data minimization gap** that should be addressed before production launch

**Priority:** HIGH — implement PaymentMethod detachment at minimum before launch
