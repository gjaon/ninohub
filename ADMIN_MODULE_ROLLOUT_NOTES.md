# Admin Module + Checkout Fallback Rollout Notes

## Feature Flags

Set these flags explicitly per environment:

- `MARKETPLACE_ADMIN_MODULE_ENABLED=false`
- `MARKETPLACE_CHECKOUT_FALLBACK_ENABLED=false`
- `MARKETPLACE_ADMIN_MESSAGING_ENABLED=false`

Suggested staged rollout:

1. Enable `MARKETPLACE_ADMIN_MODULE_ENABLED` for internal admin access.
2. Enable `MARKETPLACE_CHECKOUT_FALLBACK_ENABLED` and monitor fallback queue volume.
3. Enable `MARKETPLACE_ADMIN_MESSAGING_ENABLED` after provider credentials are validated.

## Admin Access

- Backend authorization is enforced via `ADMIN_EMAIL_ALLOWLIST`.
- Provide comma-separated admin emails, e.g.:
  - `ADMIN_EMAIL_ALLOWLIST=admin1@ninohub.com,admin2@ninohub.com`

## Messaging Provider Configuration

Email via Resend:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

SMS via Termii:

- `TERMII_API_KEY`
- `TERMII_SENDER_ID` (optional, defaults to `NINO`)
- `TERMII_CHANNEL` (optional, defaults to `generic`)

## Frontend UX Admin Check

Frontend checks are UX-only. Optionally provide:

- `REACT_APP_ADMIN_EMAIL_ALLOWLIST=admin1@ninohub.com,admin2@ninohub.com`

## Operational Checklist

- Confirm admin allowlist set in production before enabling admin module.
- Validate fallback queue endpoints from admin panel.
- Run a controlled payment success + provider failure simulation and verify fallback creation.
- Retry from admin panel and verify single final order outcome.
- Send a small campaign to test recipients and inspect delivery logs.
- Monitor business events for admin actions and fallback retry outcomes.
