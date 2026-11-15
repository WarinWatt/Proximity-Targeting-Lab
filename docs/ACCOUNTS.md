# Accounts, roles and temporary test access

## Workspaces

| Active role | Workspace |
|---|---|
| customer | Advertiser wallet, funded campaigns and own results |
| operator | Station console and live monitoring |
| reviewer | Playback evidence and retrospective billing review |
| owner | System overview, credit grants and user management |

A user can have multiple assigned roles and selects one active role per session. Role selection is checked on the server; a client selector never grants a new permission. Disabling a user or revoking a role invalidates existing access on subsequent requests.

## Registration and administration

Self-registration creates an advertiser account only. An owner assigns additional roles. Account deactivation preserves campaign, wallet and billing history; user records referenced by accounting are not hard-deleted. The last active real owner must remain available. Password changes use password hashes, and self-service password changes require the existing password.

Email is account contact information; this release does not claim email delivery, ownership verification or automated forgotten-password recovery.

## Test prefill

The login page offers disposable trial accounts when temporary test mode is enabled. Prefill values are intentionally visible test credentials, never the private lab-owner/lab-customer credentials. Trial data and credit operations are scoped separately from operational accounts; demo roles cannot modify operational accounts or station configuration.

The private demo manifest is stored outside the web document root. It records enabled state, expiry and only generated trial credentials. Disabling test mode hides the profile list and blocks existing trial sessions on the server. Do not rely on merely hiding the frontend selector.

## Handover

The system owner disables temporary test access in user management, verifies that trial login and existing trial sessions are rejected, and retains private operational accounts. Review assigned roles and disabled accounts before handover. Trial wallet and campaign records remain identifiable for audit.
