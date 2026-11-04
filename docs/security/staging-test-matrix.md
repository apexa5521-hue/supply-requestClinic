# Masar staging security test cases — 2026-11-04

**Scope:** attachment access, multi-clinic / multi-tenant isolation, UI regressions, external file sharing and operational hardening. **Status:** Prepared only; live integration tests **NOT executed**. Do not use real patient data.

**Safety boundary:** use disposable synthetic users, facilities, requests and files in an isolated staging database and staging service. Never run tests that alter Masar-Production. No production keys, personal data, or secrets in bug reports.

## Setup prerequisites

- Confirm the intended Render workspace and staging service and the **staging** database belong together.
- Confirm staging uses neither the production DATABASE_URL nor production OAuth/Drive credentials, backup destination or notification targets.
- Define two independent test tenants: `CLINIC_A` and `CLINIC_B`. Distinguish tenant from branch and clinic; ensure every object and user has correct tenant identity.
- Provision disposable accounts: `A_admin`, `A_doctor`, `A_nurse`, `B_admin`, `B_doctor`, `B_nurse`, plus a disabled account.
- Seed A and B with separate requests, receipts, images, signatures, file IDs, exported documents and **nonpublic** test Drive objects.
- Validate active UI JavaScript source: inspected `JavaScript.html` content on this branch was empty; identify the real asset before UI work.
- Record request ID, role, tenant, expected result, actual status code and sanitized evidence. Do not capture bearer tokens in screenshots/logs.

## Test matrix

| ID | Test | Expected result | Status |
|---|---|---|---|
| AUTH-01 | GET /files/:id without Authorization | 401; no file bytes or redirect | NOT RUN |
| AUTH-02 | Invalid, revoked or expired bearer token | 401; no bytes or redirect | NOT RUN |
| AUTH-03 | Correct session + owned accessible file | 200 for private file, safe content type, no-store | NOT RUN |
| TEN-01 | A user requests B file by known ID | 403 or nondisclosing 404; zero file data | NOT RUN |
| TEN-02 | B user requests A file by known ID | 403 or nondisclosing 404; zero file data | NOT RUN |
| TEN-03 | Within A, role without entitlement requests restricted A file | 403/404 | NOT RUN |
| TEN-04 | Switch request ID or guess sequential file IDs across tenants | All unauthorized objects denied | NOT RUN |
| TEN-05 | Deleted/unlinked file or ambiguous ownership | Fail closed 403/404 | NOT RUN |
| TEN-06 | Disable user / revoke role / log out then retry file link | Access denied immediately subject to session invalidation policy | NOT RUN |
| DRIVE-01 | Open old and new Drive-derived URLs anonymously | Private test files cannot be opened without authorization | NOT RUN |
| DRIVE-02 | Attempt authorized API call then follow Drive redirect from unrelated user | No bypass of tenant/record scope | NOT RUN |
| UI-01 | Authorized doctor/nurse images and attachments on desktop | Correct preview and downloads after auth integration | NOT RUN |
| UI-02 | Same tests in iPhone Safari/iPad Safari | Images/downloads function; object URLs cleaned up | NOT RUN |
| UI-03 | Open raw image URL in new tab or copy link to incognito | Denied without eligible session | NOT RUN |
| DATA-01 | A/B request lists, API detail calls, exports, notifications | Cross-tenant record IDs absent from responses | NOT RUN |
| DATA-02 | SQL and RLS permission review for test role | Tenant-scoped access; no unintended public table privileges | NOT RUN |
| OPS-01 | Check backup, logs, analytics and support access for identifiers | No sensitive data exposed to unapproved recipients or regions | NOT RUN |
| TLS-01 | Verify PostgreSQL certificate checks and trusted TLS in staging | Certificate verified; invalid server certificate refused | NOT RUN |

## Release blockers already visible from static code inspection

1. Current security-branch `/files/:id` verifies login but **does not bind file ID to a tenant/record-level authorization decision**. TEN-01/TEN-02 cannot be marked passed until fixed and tested.
2. File retrieval can redirect to Google Drive. Review share permissions and old public URLs; API protection alone is insufficient.
3. Browser integration may break because a normal HTML image tag cannot supply a bearer authorization header. Update actual frontend with authenticated fetch or a suitable secure delivery mechanism.
4. `JavaScript.html` appeared empty when fetched from this branch. Confirm actual source before changing HTML or claiming UI tests pass.

## Reporting rubric

- `PASS`: test was run against isolated staging, expected result confirmed and sanitized evidence recorded.
- `FAIL`: observed unauthorized access, leak, broken permitted function or improper authentication.
- `BLOCKED`: staging, code, credentials, fixtures or permissions insufficient.
- `NOT RUN`: no live test has been executed.

Do not mark a check PASS on static code appearance alone. Do not merge or deploy to production without passing all applicable security and regression cases and separate legal/compliance review.
