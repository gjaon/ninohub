# NINO Full-Project Review Prompt

You are reviewing the **NINO monorepo** (Node/Express backend at root + CRA React frontend in `client/`).

## Review objective
Perform a high-signal, end-to-end code review focused on:
1. Correctness and runtime safety
2. Authentication/session security (cookie JWT flow)
3. Marketplace integration resilience and failure handling
4. Data consistency (cart, holds, orders, webhook delivery)
5. Config/env safety (especially feature flags)
6. Test quality and reliability
7. Production-readiness gaps and prioritized remediation

## Constraints and context
- Backend tests run via: `npm test` (Node test runner).
- Frontend is CRA-based in `client/`.
- Marketplace configuration is centralized in `config/marketplaceConfig.js`.
- Several tests currently fail without a JWT secret because marketplace feature gates are effectively default-on.

## Minimal environment profile for review
Assume this minimal backend `.env` unless a check explicitly requires external integrations:

```dotenv
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/nino-review
JWT_SECRET=review_jwt_secret_change_me
PAYSTACK_MODE=test
PAYSTACK_SECRET_KEY=sk_test_placeholder
CLIENT_ORIGIN=http://localhost:3000
```

Optional frontend `.env` for local UI sanity check:

```dotenv
REACT_APP_SERVER_URL=http://localhost:5001
REACT_APP_API_URL=http://localhost:5001
```

Do **not** require real provider or messaging credentials for baseline review.

## High-priority inspection targets
1. `config/marketplaceConfig.js`
   - Validate feature-flag semantics and defaults.
   - Confirm env assertions are intentional and non-contradictory.
2. `server.js`
   - Startup dependency chain, CORS policy, auth/cookie parsing, warm-sync behavior.
3. `controllers/` and `services/marketplace/`
   - Error handling, idempotency, retry/circuit behavior, security boundaries.
4. `middleware/`
   - Auth/admin enforcement and trust boundaries.
5. `tests/`
   - Why failing tests fail; whether failures indicate regressions or environment coupling.

## Required outputs
Return your review in this structure:

1. **Executive Summary** (max 10 bullets)
2. **Top Risks (P0/P1/P2)** with rationale
3. **Confirmed Bugs/Defects**
   - Include file paths and exact problematic logic
   - Explain impact and reproduction condition
4. **Configuration & Env Findings**
   - List vars that are truly required vs optional
   - Highlight dead/duplicated/confusing envs
5. **Test Suite Findings**
   - Classify current failures as: product bug, test bug, or env/setup issue
6. **Security Findings**
   - JWT/cookie, CORS, webhook signature verification, admin allowlist
7. **Action Plan**
   - Prioritized fixes in implementation order
   - Include “quick wins” vs “structural fixes”

## Important instructions
- Prefer root-cause findings over style comments.
- Avoid speculative issues; tie each issue to concrete code.
- If uncertain, mark confidence level (High/Medium/Low).
- Do not propose large rewrites unless clearly justified.
- Distinguish backend-only, frontend-only, and integration-level concerns.
