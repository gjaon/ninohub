# Admin + Coupon + SMS Rollout Prompt (Non-Breaking)

You are a senior full-stack engineer working in an existing Node/Express + React monorepo.
Implement the following end-to-end without breaking existing behavior.

## Goal
Add a one-time discount coupon system that is validated before Paystack checkout initialization, revamp the Admin page UX for non-technical admins, and enable SMS-only (Termii) dynamic coupon messaging—especially for waitlist members first, then other users.

## Hard Constraints
1. No breaking changes to existing API contracts already used by current frontend flows.
2. Keep existing checkout success/fallback/idempotency protections intact.
3. Preserve admin auth/feature-flag model.
4. For admin fallback details, do not display raw JSON blobs to admins.
5. Messaging: TERMII SMS only for this scope; no emails.
6. Coupons are one-use and must only apply after successful validation.
7. Apply smallest safe changes; do not refactor unrelated modules.

## Existing System Facts You Must Respect
- Checkout uses marketplace flow via `POST /api/marketplace/checkout/initialize` then Paystack redirect and `POST /api/marketplace/checkout/verify`.
- Checkout totals currently come from subtotal + shipping + VAT in both frontend and backend.
- Idempotency is enforced on checkout initialize via `x-idempotency-key`.
- Admin panel already has tabs for fallbacks/users/waitlist/campaigns.
- Campaign system currently supports email + sms; this rollout should use SMS only.
- Template renderer supports `{{variable}}` style placeholders.
- Fallback details are currently shown as raw JSON in admin UI.

## Implementation Strategy (Phased)

### Phase 1: Coupon Domain Model + Indexes
Create a new model for one-use coupons (single redemption per coupon code).

Required fields:
- `code` (string, unique, uppercase, indexed)
- `discountType` (`amount` | `percentage`)
- `discountValue` (number > 0)
- `currency` (default `NGN`)
- `status` (`active` | `redeemed` | `expired` | `revoked`)
- `assignedToType` (`waitlist` | `user` | `manual`)
- `assignedToRef` (ObjectId or null)
- `assignedEmail` (string or null)
- `assignedPhone` (string or null)
- `createdByAdminEmail` (string)
- `expiresAt` (date, optional)
- `redemption` object:
  - `redeemedAt`
  - `redeemedByUserId`
  - `paymentReference`
  - `orderId`
- timestamps

Indexes:
- Unique index on `code`.
- Compound index for lookup by assignment (`assignedToType`, `assignedToRef`, `status`).
- Index by `status`, `createdAt`.

Do not alter existing models in a way that breaks old records.

### Phase 2: Checkout Coupon Validation and Pricing Integration
Integrate coupon handling into marketplace checkout initialization flow (before Paystack redirect).

Backend requirements:
1. Add a coupon validation helper/service:
   - Normalize code input.
   - Ensure coupon exists and is `active`.
   - Ensure not expired/revoked/redeemed.
   - Ensure assignment eligibility:
     - Waitlist-targeted coupon can be used only by matching user/waitlist identity (email/phone/user link).
     - User-targeted coupon can be used only by assigned user.
2. Extend checkout initialization request payload to accept optional `couponCode`.
3. On valid coupon:
   - Compute discount amount.
   - Support both `amount` and `percentage`.
   - Cap effective discount so final payable total never goes below zero.
   - Recompute totals in backend authoritative path.
4. Persist coupon snapshot on hold for verification consistency:
   - Add optional `coupon` info in `InventoryHold` (code, type, value, appliedDiscount, status at init).
5. Return applied coupon + discount breakdown in initialize response payload.

Pricing rule for this rollout:
- Apply discount to subtotal first, then compute VAT on discounted subtotal, then add shipping.
- If discount exceeds subtotal, discounted subtotal is zero.

Frontend checkout requirements:
1. Add coupon input field and “Apply” action on checkout review step before “Proceed to Paystack”.
2. Show clear states: idle, validating, applied, invalid.
3. Show updated totals row:
   - Subtotal
   - Discount
   - Shipping/Pickup
   - VAT
   - Total
4. “Proceed to Paystack” must submit selected coupon code in initialize payload.
5. Preserve existing checkout auth/session/reservation behavior.

### Phase 3: Redeem Coupon on Successful Verification
In finalization path (`verify` / `finalizeMarketplaceCheckoutByReference`):
1. If hold has coupon snapshot, mark coupon as redeemed atomically when order is finalized.
2. Prevent race conditions:
   - Use atomic update (`status: active -> redeemed`) and fail safely if already redeemed.
   - Keep checkout idempotent behavior for repeated verify calls.
3. Save redemption metadata (`paymentReference`, `orderId`, `redeemedByUserId`, timestamp).
4. Ensure fallback retry path still works and does not double-redeem.

### Phase 4: Admin APIs for Coupon Generation and Distribution
Add admin endpoints under existing admin protections for coupon lifecycle.

Required endpoints:
1. `POST /api/admin/coupons/generate/waitlist`
   - Generate unique one-use codes for waitlist members (filtered by status/search).
   - Supports discount config (`amount` or `percentage`, value, expiry).
   - Supports dry-run preview.
2. `POST /api/admin/coupons/generate/users`
   - Generate for selected users or user filters.
3. `GET /api/admin/coupons`
   - Paginated list + filter by status/type/assignedToType/date/code search.
4. `POST /api/admin/coupons/:code/revoke`
   - Mark active coupon as revoked.
5. `POST /api/admin/coupons/send-sms`
   - Send coupon SMS to generated recipients using dynamic template and Termii.
   - Must log per-recipient outcomes.

All endpoints must remain behind existing admin flag/auth middleware.

### Phase 5: Admin UI/UX Revamp (Non-Technical Friendly)
Revamp `AdminPanel` UX while preserving route and auth gating.

Required UI updates:
1. Add a dedicated Coupons workspace/tab with:
   - “Generate for Waitlist” section
   - “Generate for Users” section
   - Coupon table with status badges and quick actions
   - SMS template composer + send action
2. Convert fallback details view from raw JSON `<pre>` to readable sections:
   - Buyer Info
   - Payment Info
   - Items Summary
   - Error Summary
   - Timeline/History
   - Admin Notes
3. Provide plain-language labels/messages and action confirmations.
4. Keep layout responsive and consistent with existing style approach.

Do not introduce unrelated pages or workflow changes.

### Phase 6: SMS-Only Dynamic Templates (TERMII)
For this rollout, messaging channel is SMS only.

Requirements:
1. In admin campaign/coupon sending flows, restrict selectable channels to `sms` only.
2. Keep template variable rendering dynamic.
3. Add coupon-aware variables:
   - `{{name}}`
   - `{{firstName}}`
   - `{{phone}}`
   - `{{couponCode}}`
   - `{{discountText}}` (e.g., “₦2,000 off” or “10% off”)
   - `{{expiryDate}}`
4. Ensure Termii provider integration is reused and robustly logged.
5. No email dispatch in this scope.

### Phase 7: Data Backfill + Compatibility
1. Existing records without coupon data must continue to function.
2. Optional schema fields only; no required migration that blocks startup.
3. Add safe defaults for old holds/orders/fallback records.
4. If coupon object is absent, checkout behaves exactly as before.

### Phase 8: Testing and Verification
Add/extend tests with existing `node:test` style.

Minimum new test coverage:
1. Coupon model constraints:
   - Unique code
   - Valid discount type/value
2. Checkout initialize with coupon:
   - Valid amount coupon applies correctly
   - Valid percentage coupon applies correctly
   - Invalid/expired/redeemed coupon rejected
3. Verify/finalize:
   - Coupon redeemed once
   - Duplicate verify call remains idempotent
4. Admin generation:
   - Bulk generation for waitlist
   - Generation for users
5. SMS template rendering:
   - Coupon variables rendered
6. Admin fallback readable mapping:
   - Ensure formatter returns human-readable sections and no raw JSON blob in UI rendering path.

Also run existing fallback/idempotency/payment tests to confirm no regressions.

## API Contract Additions (Non-Breaking)
- Extend checkout initialize request body with optional `couponCode`.
- Extend initialize response with:
  - `discountBreakdown` (code/type/value/appliedAmount)
  - updated `amountBreakdown` including `discount`.
- Keep all existing response fields unchanged.

## Operational Safety
- Add structured logs around coupon validation/redemption with correlation id.
- Never log full PII unnecessarily.
- Ensure admin bulk actions return summaries (`requested`, `generated`, `skipped`, `failed`).

## Deliverables
1. New coupon model + controller/service + routes.
2. Checkout frontend + backend coupon integration.
3. Admin panel UX revamp with coupon management and readable fallback details.
4. SMS-only dynamic messaging for coupon distribution via Termii.
5. Automated tests covering new and critical non-regression paths.
6. Short rollout notes with feature-flag guidance and rollback plan.

## Acceptance Criteria
- A shopper can enter a valid coupon at checkout; total updates before Paystack redirect.
- Invalid coupon cannot reduce price and shows clear error message.
- A generated one-use coupon is redeemable exactly once.
- Admin can bulk-generate waitlist coupons and send dynamic SMS containing each member’s code.
- Admin can generate coupons for users outside waitlist.
- Fallback details in admin are readable by non-technical staff (no raw JSON block UI).
- Existing checkout and marketplace fallback/idempotency flows still pass tests.

## Execution Notes
- Implement in small commits logically grouped by phase.
- Prefer additive changes over intrusive rewrites.
- If any ambiguity appears, choose the simplest non-breaking behavior and document it in rollout notes.
