# Security notes

## Secrets

Never commit:

- `.env`
- OpenAI keys
- SMTP passwords
- `APP_ENCRYPTION_KEY`
- Production database credentials

Use a managed secret store in production.

## Passwords

Passwords are hashed with scrypt and a random per-password salt. Temporary student passwords are generated with cryptographically secure randomness and must be changed on first login.

Temporary passwords are sent by email because that is a specified business requirement. A one-time invite-link flow would reduce the exposure of temporary credentials and can be introduced later without changing the student account model.

## Sessions

Session cookies are:

- HTTP-only
- Secure under `NODE_ENV=production`
- SameSite=Lax
- Rolling while the user remains active
- Revoked on password reset
- Revoked on other devices after a password change

## File uploads

Only a defined list of images, PDFs, CSVs, Word files, Excel files and plain-text files is accepted. Files receive random UUID filenames. Non-image documents are delivered as downloads rather than executable page content.

For a higher-security deployment, place uploaded resources in S3-compatible object storage and enable malware scanning.

## Database

Use encrypted managed PostgreSQL, automatic backups and point-in-time recovery. Restrict network access so that only the application can connect.

## OpenAI

OpenAI requests are made from the server. Do not put an API key in `public/app.js`, browser storage or a client-side environment variable.

## Recommended additions before large-scale use

- Sentry or equivalent error monitoring
- Uptime monitoring
- Centralised logs
- Automated database backups
- Object storage for files
- Antivirus scanning for uploaded documents
- Periodic dependency scanning
- A privacy and retention policy for student submissions
