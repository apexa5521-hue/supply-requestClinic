# Masar attachment-security release gate (2026-11-04)

Status: **BLOCKED — do not merge or deploy**. This is a verification plan, not evidence that tests passed.

## Confirmed by code inspection
- `production-postgresql/server.mjs` previously served `GET /files/:id` by identifier without checking the caller.
- The security branch adds bearer-session checking and `Cache-Control: no-store`, but does not check whether the authenticated user may access the particular record/file.
- Some files redirect to Google Drive URLs. A redirect does not secure a file if Drive sharing grants public access.
- The `JavaScript.html` blob on the inspected branch is empty, while `Index.html` expects it to provide browser functionality. Identify the active frontend source before changing previews.
- `Code.gs` includes an `ANYONE_WITH_LINK` sharing call in an attachment creation path; review its callers and sharing scope. Do not assume this applies to every file.

## Required controls
1. Link each file ID to its owning record, clinic, and tenant. Authorize each read server-side using the live session and permissions. Unknown ownership: deny by default.
2. Deliver bytes through a checked endpoint (or short-lived scoped signed URLs). Do not expose public Drive links or encode authentication in URLs.
3. Update image and download UI with authenticated fetch + object URL. Revoke object URLs after use, and test mobile browsers.
4. Ensure cache headers are no-store and logs do not capture bearer tokens, download secrets, or medical data.
5. Verify the file's MIME type is safe; set Content-Disposition appropriately for downloads.
6. Check permissions and revocation for every Google Drive-backed file; audit historic public shares.
7. Ensure rate limits, audit events, and alerting exist for repeated denied requests.

## Negative tests (must all be rejected)
- Anonymous request with known ID -> 401.
- Invalid/expired/revoked token -> 401.
- Logged-in user from clinic A requesting a file of clinic B -> 403 (or non-disclosing 404).
- Logged-in user lacking role/record entitlement -> 403/404.
- Deleted/unlinked file, or file with ambiguous owner -> 404/403.
- Public Drive URL opened without authorization -> denied at the Drive layer.
- Attempt via guessed ID, copied image URL, browser address bar, and alternate content format -> denied.

## Positive regression tests
- Authorized doctor, nurse and supply staff can each open only entitled documents.
- Images display on iOS Safari and desktop; downloads continue to work.
- Log out, change role, remove user, expire session -> immediate denial.
- No cross-tenant images, receipts, signatures or attachments in search, notifications, exports, backups.

## Approval before release
- Capture test outcomes and reviewer sign-off; no real patient data in staging.
- Verify tenant separation and Saudi data-transfer requirements independently.
- Run automated tests and deploy to staging first, then review the production rollout.
- **Do not modify Masar-Production from this branch without explicit deployment approval.**
