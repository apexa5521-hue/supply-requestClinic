# Masar — isolated 7-clinic test

Date: 2026-11-03

## Safety
This test must run on branch `test/masar-seven-clinics-isolated-20261103` and an independent staging database. Do not modify, deploy over, or load-test `masar-app` / `Masar-Production`. Do not copy production credentials or customer data.

## Current architecture verified
- Production Render: `masar-app`, branch `production-postgresql`, free single Node.js instance, Singapore.
- Backend: Express + Code.gs runtime, Postgres via DATABASE_URL (Supabase).
- API calls are serialized in server.mjs and Store loads data into an in-memory GAS-style model.
- Existing Code.gs tests simulate requests in memory; they do not prove real multi-tenant performance.
- Isolated databases per medical complex are planned, not currently verified.

## Test acceptance criteria
1. Establish dedicated staging Postgres and Render service with synthetic data only.
2. Verify distinct isolated data stores for 5, 7 and 10 simulated complexes.
3. Test authentication and cross-tenant read/write/file access denial.
4. Run concurrent request workflows and record p50/p95 response time, error rate, RAM, CPU and database usage.
5. Export and restore one complex into a fresh staging destination; verify records, files and permissions.
6. Cost model: SAR 3,600 yearly/customer, SAR 180/month maximum direct costs for 40% gross margin.
7. No go-live until isolation, backups, latency and costing are verified.

## Blocking decisions
- Provision independent staging project (the only linked Supabase projects presently visible are Masar-Production and another unrelated project).
- Implement tenant-aware routing / isolated database connections; the current single DATABASE_URL and global in-memory store do not implement seven separate tenants.
