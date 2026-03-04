# Grouped Listing + Variant Migration Notes

## Scope
- Group listings are projected as one catalog listing per group (with nested variants).
- Group checkout/order lines now carry `listingId + variantId` identity.
- Cart line uniqueness is `productId + variantId` (`lineKey` format: `productId::variantId`).
- Legacy carts/holds/orders with product-only shape remain supported.

## Backward Compatibility
- Legacy projection rows (`metadata.listingType = group-variant`) are collapsed to one group listing at read time.
- Checkout line resolution accepts:
  - New: `listingId + variantId`
  - Legacy: `productId`
  - Legacy grouped hold/cart: `parentGroupId + productId(variant)`
- Provider payload normalization still accepts product-only lines.

## Rollout Steps
1. Deploy backend first (`inventoryProjectionService`, `marketplaceController`, `providerClient`, `server socket cart handlers`).
2. Trigger inventory sync (`/api/marketplace/inventory/sync`) so new group projections are written.
3. Deploy frontend (`ProductCard`, `ProductDetail`, `Cart`, cart socket identity updates).
4. Monitor checkout initialize/verify logs for unresolved line items.
5. After stable period, optionally clean old cache rows where `metadata.listingType = group-variant`.

## Rollback Plan
- Revert to previous backend/frontend release.
- Keep existing carts/orders intact: schemas are additive, so rollback remains data-safe.
- If needed, re-run inventory sync after rollback to restore previous read behavior.
