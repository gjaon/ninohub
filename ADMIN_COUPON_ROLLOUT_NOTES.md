# Admin Coupon Rollout Notes

## Scope Delivered
- One-use coupon domain model with assignment, expiry, redemption metadata, and indexes.
- Coupon validation integrated before checkout initialization with discount-aware pricing.
- Coupon snapshot persisted on checkout hold and redeemed atomically on successful finalize.
- Admin coupon APIs for generation (waitlist/users), listing, revoke, and SMS sending via Termii.
- Admin panel revamp with dedicated Coupons workspace and human-readable fallback detail sections.
- Messaging constrained to SMS-only in admin campaign/coupon flows, with dynamic template variables.

## Feature Flag Guidance
Existing flags were reused (no new flag contract changes):
- `adminModuleEnabled`: gates all admin routes.
- `adminMessagingEnabled`: gates campaign/coupon messaging and coupon admin endpoints.
- `checkoutFallbackEnabled`: still gates fallback review/retry endpoints.
- `internalUiEnabled` / `publicApiEnabled`: continue gating marketplace checkout endpoints.

Recommended rollout sequence:
1. Ensure `adminModuleEnabled=true`, `adminMessagingEnabled=true` in staging.
2. Validate Termii credentials (`TERMII_API_KEY`, optional sender/channel overrides).
3. Generate coupons using dry-run first, then real generation.
4. Validate checkout coupon apply + verify on staging before production enablement.

## Rollback Plan
Fast rollback options (non-destructive):
1. Disable `adminMessagingEnabled` to block coupon generation/SMS endpoints.
2. Revert frontend deployment to hide coupon UI while backend remains backward compatible.
3. Revoke active coupons via admin endpoint if a campaign is paused.
4. If necessary, disable `internalUiEnabled`/`publicApiEnabled` checkout entry points per existing operational runbook.

Data safety:
- Added coupon/hold fields are optional and additive.
- Existing orders/holds/fallbacks without coupon fields continue to function.
- Checkout without `couponCode` behaves as pre-rollout flow.
