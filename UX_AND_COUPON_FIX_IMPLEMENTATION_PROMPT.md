# UX + Coupon + Admin Fix Implementation Prompt

You are a senior MERN engineer working in the NINO monorepo. Implement the following with minimal, safe, architecture-aligned changes.

## Scope
1. Improve cart/checkout interaction feedback (add-to-cart, re-add items, proceed-to-checkout).
2. Fix admin-generated coupon rejection in checkout eligibility checks.
3. Restore/improve admin panel styling consistency.
4. Add waitlist coupon automation + selectable coupon SMS sending.

## Constraints
- Preserve existing route and API contracts where possible.
- Avoid broad refactors and avoid unrelated behavior changes.
- Keep UX updates additive and minimal.
- Ensure pickup checkout flow still supports coupon validation.

## Backend tasks
1. In coupon eligibility logic (`services/marketplace/couponService.js`):
   - Keep existing assignment rules.
   - For `assignedToType === "waitlist"`, allow matching via authenticated user profile (`buyerId` lookup to `User`) when shipping email/phone is missing or different.
   - Continue matching by assigned email/phone and waitlist row email/phone.
2. Do not alter redemption semantics.

## Frontend tasks
1. Product card add-to-cart feedback:
   - Add per-card pending state while socket ack is in-flight.
   - Disable button and show “Adding…” until ack or timeout.
   - Keep existing success/error toasts.
2. Cart page re-add feedback:
   - Add in-progress state for re-adding expired items.
   - Aggregate callback results and show completion toast with success/failure counts.
   - Disable re-add button during operation and show status text.
3. Cart proceed-to-checkout feedback:
   - Add short-lived pending state (`Opening checkout...`) and disable button while routing.
4. Remove unnecessary noisy console logs causing UI/perf jitter.

## Admin panel tasks
1. Styling:
   - Expand `AdminPanel.css` so tabs, inputs, selects, textareas, buttons, cards, tables, and helper text are consistently styled.
2. Waitlist coupon automation:
   - Add a one-click action in coupon tab to generate coupons for all waitlist members using current discount form settings.
   - Ensure waitlist coupon default status filter is “all” (not only pending).
3. Coupon SMS targeting:
   - Add coupon row checkboxes in coupons table.
   - Add “select all active” and “clear selection” controls.
   - In send-SMS form, support sending to either selected coupons or all active coupons.
   - Keep existing backend endpoint (`/api/admin/coupons/send-sms`) and pass `couponCodes` when sending selected subset.

## Validation
- Run targeted tests for coupon and admin/coupon messaging paths if available.
- Run lint/check for changed frontend/backend files.
- Confirm no new runtime errors in edited files.

## Output expectations
- Summarize changed files and behavior.
- Call out any pre-existing issues encountered but not modified.