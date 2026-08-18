# Auth And Authorization Spec

## Scope

- Add local account bootstrap from `requester_directory` for active emails only.
- Seed fixed special accounts `PQE@admin` and `@Guest`.
- Use server-side opaque cookie sessions for authenticated API access.
- Enforce role-based authorization on reservations, equipment, requester directory, and user-role management.
- Bind reservation audit identity to the authenticated server user, not client-supplied names.

## Non-goals

- No external identity provider.
- No JWT or browser-local role storage.
- No role edits for predefined special accounts.
- No self-registration for unknown emails.

## Roles

- `admin`
  - Fixed account `PQE@admin`.
  - Full read/write access.
  - Can list users and change roles for non-special accounts only.
- `manager`
  - Default first-login role for active requester emails in department `PQE`.
  - Can change own password.
  - Can create reservations for self or other active requesters.
  - Can update/cancel own reservations directly.
  - Can update/cancel another person's reservation only when `authorization_email` exactly matches the current reservation owner email.
  - Cannot mutate equipment, requester directory, or user roles.
- `member`
  - Default first-login role for all other active requester emails.
  - Can change own password.
  - Can create/update/cancel only own reservations.
  - Reservation identity is server-bound to the authenticated account.
  - Cannot mutate equipment, requester directory, or user roles.
- `guest`
  - Fixed account `@Guest`.
  - Read-only access.
  - Cannot create or update anything.

## Enforcement Points

- `POST /api/auth/login`
  - Existing account: verify salted PBKDF2 password hash.
  - First login: only active `requester_directory.email` may initialize an account.
  - Initial role is derived once from requester department.
- `GET /api/equipment`, `GET /api/requesters`, `GET /api/reservations`
  - Require any valid session.
- `POST/PATCH /api/equipment`
  - Admin only.
- `POST/PATCH /api/requesters`
  - Admin only.
- `POST /api/reservations`
  - Guest forbidden.
  - Member identity forced to own account.
  - Manager/admin may target another active requester by email.
- `PATCH /api/reservations/:id`
  - Admin unrestricted.
  - Member only own reservations.
  - Manager own reservations directly; other-owner reservations require matching `authorization_email`.
- `GET /api/users`
  - Admin only.
- `PATCH /api/users/:id/role`
  - Admin only.
  - Special account roles immutable.
- `POST /api/auth/password`
  - Authenticated self only.
  - Special accounts keep fixed passwords.

## Acceptance Checklist

- Active requester first login creates a local account and role.
- Unknown or inactive emails cannot bootstrap accounts.
- Special admin and guest logins work.
- Protected data APIs return `401` without a valid session.
- Guest writes return `403`.
- Member cannot mutate equipment or someone else's reservation.
- Manager cannot manage user roles.
- Manager can change another reservation only with matching owner email.
- Admin can list users and change a non-special user's role.
- Password changes require current password and apply only to self.
- Frontend loads no protected data before authentication.
- Frontend shows account/role, logout, own password change, and admin-only role management.

## Executable Test Mapping

- `tests/test_api.py`
  - `test_first_login_derives_default_role_and_persists_identity`
  - `test_first_login_rejects_ineligible_or_wrong_credentials`
  - `test_special_admin_and_guest_accounts_can_log_in`
  - `test_protected_get_requires_authentication`
  - `test_guest_is_forbidden_from_state_changing_requests`
  - `test_member_can_only_manage_own_reservations_and_is_server_bound`
  - `test_manager_needs_matching_authorization_email_for_other_users_reservation`
  - `test_manager_cannot_mutate_account_roles`
  - `test_admin_can_list_users_and_change_non_special_roles`
  - `test_password_change_requires_auth_and_applies_only_to_self`
- `tests/test_static_ui.py`
  - Login gate, auth controls, role-bound view hooks, reservation authorization UI hooks.
- `tests/e2e/home.spec.js`
  - Guest login blocks pre-auth protected loads and keeps mutation UI hidden.
  - Member login auto-binds requester identity and hides admin-only views.
