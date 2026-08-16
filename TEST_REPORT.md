# Test report

Run date: 3 August 2026

## Passed in the build environment

- JavaScript syntax check for the server
- JavaScript syntax check for every source file
- JavaScript syntax check for the complete browser application
- Temporary-password policy tests
- Password hash and verification tests
- Session/reset token hashing tests
- Exact attendance icon-state tests
- Exact homework icon-state tests
- Exact check-in icon-state tests
- Zoom-style attendance-duration parsing tests

Result:

- 7 tests passed
- 0 tests failed
- 1 PostgreSQL schema smoke test skipped locally

## Why one test was skipped

This build environment does not provide a running PostgreSQL service or Docker daemon. The database smoke test is included and enabled in GitHub Actions, where PostgreSQL 16 is provisioned before migrations and tests run.

## Not honestly claimable yet

The application has not yet been operated with real production students, real email deliverability, production object storage, live OpenAI billing, monitoring or production database backups. Complete the deployment checklist and run a limited pilot before full rollout.
