# TORC Hybrid App Unification Plan

**Status**: Design only. NOT approved for implementation.

## Goal

Convert the two separate Capacitor binaries (`apps/customer-web` + `apps/provider-web`) into one unified TORC hybrid application with role-based customer/provider experience.

## Current State

- **Customer app**: 61 pages, `com.torc.customer`, handles booking/payment/tracking
- **Provider app**: 37 pages, `com.torc.provider`, handles job acceptance/navigation/earnings
- **Shared**: Supabase backend, packages/api, packages/types, packages/ui, packages/utils
- **Separate**: Auth contexts, route trees, native configs, app store listings, push channels

## Proposed Phased Migration

### Phase A: Shared Packages/Components

**Risk: Low | Effort: Small**

Extract more shared logic from both apps into `packages/`:
- Common UI components (LoadingScreen, ErrorBoundary, PageHeader)
- Shared auth helpers (token refresh, native bridge)
- Shared notification service
- Common form components

**Outcome**: Both apps import more from shared packages. No user-visible change.

### Phase B: Shared Auth/Application Shell

**Risk: Medium | Effort: Medium**

Create a unified auth context that:
- Handles login/signup for both roles
- Looks up user role from `profiles.role` after authentication
- Routes to customer or provider experience based on role
- Shares session management, token refresh, native bridge

**Key decisions**:
- One login screen with role detection vs. role selection
- How to handle users with multiple roles (if ever allowed)
- Shared vs. separate push notification registration

**Outcome**: One auth flow, two navigation trees.

### Phase C: Role-Based Routing

**Risk: Medium | Effort: Medium**

Merge both route trees into one app:
```
/                     → Splash (role check)
/login                → Shared login
/customer/*           → Customer routes (61 pages)
/provider/*           → Provider routes (37 pages)
```

Role guards prevent customers from accessing provider routes and vice versa.

**Key decisions**:
- Lazy-load role-specific route bundles to keep initial load fast
- Shared bottom navigation vs. role-specific navigation
- How provider-specific capabilities (background location) work when app is in customer mode

### Phase D: Native Capability Consolidation

**Risk: High | Effort: Large**

Merge Capacitor configs into one:
- Single `capacitor.config.ts` with unified `appId`
- Merged iOS Info.plist permissions (camera + background location + push)
- Merged Android manifest permissions
- One set of push notification channels
- Deep link handling for both roles

**Key challenges**:
- Background location permission is provider-specific but must be declared in unified binary
- Camera permission needed for both but with different usage descriptions
- Push notification routing (customer vs. provider notifications to same device)

### Phase E: App Store Migration

**Risk: High | Effort: Large**

- Choose new unified app ID (e.g., `com.torc.app`)
- OR keep `com.torc.customer` and sunset `com.torc.provider`
- Submit unified binary to stores
- Universal links / deep links must handle both roles
- Analytics/crash reporting under one app

**iOS considerations**:
- Cannot change bundle ID of existing app — must either keep one ID or create new listing
- Existing `com.torc.customer` users get the update with provider capability added
- Existing `com.torc.provider` users must migrate to the unified app
- Need App Store redirect or in-app migration prompt

**Android considerations**:
- Same applicationId constraint applies
- Play Store allows app transfers but not ID changes
- Consider Google Play's app bundle migration path

### Phase F: Retire Legacy Provider Binary

**Risk: Medium | Effort: Small**

- Remove `com.torc.provider` from stores (or redirect to unified app)
- Archive `apps/provider-web` native directories
- Keep provider React pages as a route subtree in the unified app

## Upgrade Strategy for Installed Users

1. Customer app users: seamless update via store (same bundle ID)
2. Provider app users: in-app banner directing to download unified TORC app
3. Transition period: both apps work for 3-6 months
4. Provider app removed from stores after transition period
5. Deep links redirected from provider scheme to unified scheme

## Complexity/Risk Summary

| Phase | Risk | Effort | Prerequisite |
|-------|------|--------|-------------|
| A: Shared packages | Low | 1-2 weeks | None |
| B: Shared auth | Medium | 2-3 weeks | Phase A |
| C: Role routing | Medium | 3-4 weeks | Phase B |
| D: Native consolidation | High | 2-3 weeks | Phase C |
| E: Store migration | High | 2-4 weeks | Phase D |
| F: Retire provider | Medium | 1 week | Phase E |

**Total estimated effort**: 11-17 weeks

## Recommendation

Start with Phase A (shared packages) as a low-risk preparation step. Phases B-C can be developed in parallel with ongoing feature work. Phases D-F require dedicated sprint focus due to app store implications.

Do NOT rush the store migration. The two-binary architecture works correctly and is production-stable. Unification is an optimization, not a correctness requirement.
