# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

Monorepo with two npm packages:
- Root: Node.js + Express 5 + Mongoose API and Socket.io server (`server.js`).
- `client/`: Create React App (React 19) frontend, Redux Toolkit, redux-persist, socket.io-client.

In `production`/`staging`, `server.js` also serves `client/build` as static assets and falls back to `index.html` for any non-`/api` route.

## Commands

Backend (run from repo root):
- `npm run dev` — start API with nodemon (default port `5001`, override with `PORT`).
- `npm start` — start API without nodemon.
- `npm test` — runs `node --test tests/**/*.test.js` (Node's built-in test runner; no Jest).
- Run a single backend test: `node --test tests/<name>.test.js` (e.g. `node --test tests/idempotency.test.js`).
  - Tests use `mongodb-memory-server` via `tests/helpers/db.js` (`connectTestDb`/`clearTestDb`/`disconnectTestDb`). They do not hit `MONGO_URI`.

Frontend (run from `client/`):
- `npm start` — CRA dev server (port `3000` by default; allowed origins also include `3001`, `3005`, `5173`).
- `npm run build` — production build to `client/build/`.
- `npm test` — `react-scripts test` (Jest); a single test: `npm test -- App.sync.test.js` or `npm test -- --testPathPattern=marketplaceSyncSlice`.

Smoke / latency benchmark (root): `node scripts/smoke-latency-benchmark.js`.

## Environment & Configuration

- Backend env file is `.env` at repo root; `.env.example` is the canonical template. `.env.live` exists for live PayStack/integration credentials — do not commit changes to these.
- Required vars for any boot: `MONGO_URI`, `JWT_SECRET`. PayStack requires `PAYSTACK_SECRET_KEY` (key prefix must match `PAYSTACK_MODE`: `sk_test_` ↔ `test`, `sk_live_` ↔ `live`; `config/marketplaceConfig.js` asserts this at startup).
- The marketplace subsystem is gated behind env-driven feature flags resolved in `config/marketplaceConfig.js` (`MARKETPLACE_PUBLIC_API_ENABLED`, `MARKETPLACE_WEBHOOKS_ENABLED`, `MARKETPLACE_INTERNAL_UI_ENABLED`, plus `_ADMIN_MODULE_`, `_CHECKOUT_FALLBACK_`, `_ADMIN_MESSAGING_`, `_CART_FAST_ACK_`, `_REALTIME_EVENT_DEDUPE_`, `_ADAPTIVE_POLLING_`, `_INVENTORY_BROADCAST_COALESCING_`, etc.).
- Enabling any of `publicApiEnabled` / `webhooksEnabled` / `internalUiEnabled` forces `PUBLIC_PARTNER_JWT_SECRET` and `MARKETPLACE_SECRET_ENCRYPTION_KEY` to be set.
- Admin authorization is allowlist-driven: `ADMIN_EMAIL_ALLOWLIST` (comma-separated emails) — see `utils/adminAccess.js`. The `requireAdmin` middleware checks `req.user.email` against this list, not a DB role.
- Frontend reads `REACT_APP_API_URL` (axios base in `client/src/services/api.js`) and `REACT_APP_SERVER_URL` (socket URL in `client/src/services/socket.js`). Both default to a hardcoded fallback — set them explicitly for non-default ports.

## Authentication

Hybrid: httpOnly cookie `accessToken` (set by `controllers/userController.js`) AND `Authorization: Bearer <token>` header. `middleware/authMiddleware.js` accepts either. The frontend axios instance puts the token from `localStorage` into the `Authorization` header AND sends cookies (`withCredentials: true`). Socket.io auth (`server.js` `io.use`) also accepts either `socket.handshake.auth.token` or the `accessToken` cookie.

CORS: `server.js` builds an allowlist from a hardcoded dev list + `CLIENT_ORIGIN` + `MARKETPLACE_FRONTEND_ORIGINS` + `MARKETPLACE_PARTNER_ALLOWED_ORIGINS`. In production, localhost origins are stripped. A literal `*` entry switches to allow-all.

## Architecture: Cross-Cutting Concerns

### Real-time core (server.js)
The Socket.io layer in `server.js` is the primary cart/product surface — not the REST routes. The `/api/cart/*` routes exist, but the React client drives cart state via socket events (`cart:add`, `cart:remove`, `cart:updateQuantity`, `cart:updateVariant`, `cart:sync`, `cart:startCheckout`, `cart:cancelCheckout`, `cart:addCustomization`) and receives `cart:updated` / `cart:synced` / `cart:error` back. Products are pushed via `products:sync` ↔ `products:synced` and an `inventory:updated` broadcast that the client debounces into a resync. `business:event` is the generic envelope for marketplace domain events; `socket.userId` rooms are `buyer:<id>`, guests use `session:<sessionId>`.

When editing cart flow, also touch `utils/cartLineUtils.js` (line keys, totals, variant switching) and `utils/cartReservation.js` (5-min cart timer, 3-min checkout timer, stock reservation, expiry cleanup loop). Stock holds live on `productModel.js` instance methods (`reserveQuantity`, `releaseReservation`, `updateReservationStatus`, static `cleanupExpiredReservations`).

### Marketplace integration
`services/marketplace/` is a self-contained subsystem that talks to an external provider (`MARKETPLACE_INTEGRATION_BASE_URL`, default `localhost:4000`; in dev this is typically the sibling `SellSquare` repo) over signed-token auth. The integration path layout is normalized in `config/marketplaceConfig.js` (`integrationBasePath` + `/listings`, `/holds`, `/orders`, `/auth/token`, `/auth/token/refresh`, `/webhooks/endpoints`).

When `shouldUseProviderProducts()` returns true (i.e., any provider integration env is set, or `internalUiEnabled`), product reads go through `inventoryProjectionService` (`MarketplaceProductCache` collection) rather than the local `data/product.js` array. The projection is warmed at startup (`startMarketplaceProjectionWarmSync`), refreshed every 10 min, and on-demand-refreshed when stale during socket sync.

Webhooks: inbound at `/api/webhooks/marketplace` (paystack + provider). Failed deliveries land in `MarketplaceWebhookDelivery` with `status: retrying` and `nextAttemptAt`; a 15s worker in `server.js` retries up to `MARKETPLACE_WEBHOOK_RETRY_MAX_ATTEMPTS`. An adaptive reconciliation worker (`startAdaptiveReconciliationWorker`) watches webhook health and shortens/lengthens the polling fallback interval based on lag thresholds.

Idempotency: buyer-scoped via `services/marketplace/idempotencyService` (`buildBuyerActionKey` + `reserveIdempotency`/`markIdempotencySuccess`/`markIdempotencyFailure`). Public partner endpoints additionally require signed nonces (`middleware/publicSecurityMiddleware`) and partner auth (`middleware/partnerAuthMiddleware`).

### Feature-flag gating
Most non-core routes are wrapped in `requireFlag(flagName)` / `requireAnyFlag([...])` from `middleware/featureFlags.js` — a disabled flag returns `404 Not Found`, not 403. When adding a route, decide which flag (or combination) gates it and follow the existing pattern in `routes/adminRoutes.js` / `routes/marketplaceRoutes.js`.

### Frontend wiring
`client/src/App.js` is the orchestrator: it hydrates the user, fetches initial products, opens the socket, and registers handlers for `cart:updated`, `business:event`, `products:synced`, `inventory:updated`, etc. It also coalesces/debounces `products:sync` emits using `client/src/config/marketplaceRealtimeFlags.js`. Product freshness compare logic is in `client/src/utils/productsFreshness.js` — use `shouldApplyIncomingSync` rather than ad-hoc timestamp checks so REST and socket payloads stay consistent. Redux state is persisted via `redux-persist` (`client/src/redux/persistence.js`); rehydration is gated on `state._persist.rehydrated`.

## Conventions

- Backend handlers use `express-async-handler`; throw `new Error(...)` after setting `res.status(...)` — `middleware/errorMiddleware.js` formats the response.
- Money is Naira (NGN). When parsing user-provided amounts, use `toMonetaryNumber` from `utils/cartLineUtils.js` (it strips `₦`, `NGN`, commas, whitespace). Don't re-implement.
- Correlation IDs propagate via `x-correlation-id` (middleware in `server.js` assigns one if missing). Pass it through into `recordMetric` / `publishEvent` / provider calls when wiring new code paths.
- New marketplace metrics: use `services/marketplace/metricsService.recordMetric(key, labels)` — labels become a sub-document. Worker code generally swallows metric errors (`.catch(() => null)`).
- Tests follow `node:test` style at the root (`test`, `test.before`, `test.beforeEach`) — do not import Jest globals there. Frontend tests under `client/` use CRA's Jest.
