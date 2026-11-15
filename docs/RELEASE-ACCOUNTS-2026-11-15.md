# Account and temporary trial access release

Deployed 15 November 2026 at the existing Proximity Ads service.

## Delivered

- Login offers five intentionally shared trial profiles: customer, operator, reviewer, owner and a manager with all four roles. User/password are prefilled only for these temporary trial profiles.
- Temporary access expires 29 November 2026 unless extended. The real owner can disable it in User Management. Both the public profile list and already authenticated trial sessions are blocked when disabled; re-enabling does not resurrect an old session.
- New registration creates a customer account with no self-assigned elevated permissions. Profile editing and current-password-verified password changes are implemented.
- User Management supports account creation, role assignment, active/disabled status and password resets, with audit records and last-real-owner protection. Reserved trial profiles remain stable; use newly created trial users to test editing.
- Multiple roles are stored in user_roles. Every request validates active account state, authentication version and current role membership.
- Temporary trial owners manage only trial users and credit/campaign data. Operational financial data and credentials remain separate. Trial roles cannot change shared station configuration.
- Initial 1,000 trial credits each were issued idempotently to trial-customer and trial-manager. Existing lab-customer credit remains unchanged.
- ERD/data dictionary and per-page report registers include the new account structures. Private demo manifest is outside document root; no generated password is committed.

## Verification

- 46 frontend/unit tests passed.
- 7 account HTTP groups passed: registration validation, escalation denial, directory permissions, profile/password checks, multi-role changes, per-request revocation and last-owner preservation.
- 9 demo isolation groups and 11 wallet checks passed on the disposable release stack.
- Browser passed account selection/prefill, four-role switching, trial-user creation, real signup and profile editing on staging.
- Public HTTPS checks passed all five prefill profiles, customer-to-owner switching, isolated user management and wallet directory, real-owner demo controls, and signup-page availability. Desktop login and mobile signup were visually inspected.
- Additive migration 005 and database invariants passed. Pre-release files/database backup remains private under .artifacts/releases/20261115-accounts.

## Limits and handover

Email is stored as contact information. No email delivery, verification or automatic email password recovery is claimed. Shared trial accounts are for test data. Turn off trial access with the real owner before handover and review remaining account roles. See ACCOUNTS.md.
