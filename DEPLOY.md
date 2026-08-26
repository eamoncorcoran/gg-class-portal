# Deploying the Class Portal

Live at **https://hub.gaeilgeoirguides.com**, running on Render out of
Frankfurt, with a managed Postgres and a 5GB disk.

Everything in `render.yaml` is applied automatically. The steps below are the
parts that need a human: they involve creating accounts, entering payment
details and changing DNS, none of which should be automated.

---

## Why this shape

The app decides its own hosting. It keeps files on disk — student work, teacher
voice notes, post attachments, the nightly database dump — so it needs a real
disk rather than a container filesystem that is discarded on each deploy. And it
runs its own scheduled work in-process: deadline reminders, the Zoom sweep, the
backup. That rules out anything serverless, and it means exactly one instance,
always on. Two instances would send every reminder twice.

---

## One-time setup

### 1. GitHub

The code has to live somewhere Render can watch.

1. Add this machine's public key at https://github.com/settings/keys →
   **New SSH key**. The key is in `~/.ssh/id_ed25519.pub`.
2. Create an empty **private** repository at https://github.com/new. Do not add
   a README, licence or .gitignore — the repository must be empty.
3. Connect and push:

   ```
   git remote add origin git@github.com:<your-username>/gg-class-portal.git
   git push -u origin main
   ```

### 2. Resend, for email

Sending runs on `send.gaeilgeoirguides.com`, a subdomain used for nothing else.
That is deliberate on two counts. `hub.gaeilgeoirguides.com` is a CNAME pointing
at Render, and a CNAME cannot share its name with any other record, so mail
records could not live there even if we wanted them to. And keeping sending off
the root domain leaves the existing Gmail and GoHighLevel SPF alone — this
cannot disturb mail that already works.

1. Sign up at https://resend.com. The free tier covers 3,000 emails a month,
   which is far above what a few class groups generate.
2. **Domains → Add Domain** → enter `send.gaeilgeoirguides.com`.
3. Resend shows three records to add at your DNS host. Add them exactly as
   given, then press Verify. See the DNS section below.
4. **API Keys → Create API Key**, with *Sending access*. Copy it once; it is
   not shown again. It goes into Render as `SMTP_PASSWORD`, not into this file
   and not into the repository.

### 3. Render

1. Sign up at https://render.com and connect the GitHub account.
2. **New → Blueprint**, choose the repository. Render reads `render.yaml` and
   proposes the web service, the database and the disk.
3. It asks for the values marked `sync: false`. The two that are required:

   | Key | Value |
   | --- | --- |
   | `APP_ENCRYPTION_KEY` | Run `npm run generate-key` locally and paste the result |
   | `SMTP_PASSWORD` | The Resend API key from step 2 |

   The rest — `OPENAI_API_KEY`, the Bunny keys, the Zoom keys, the backup
   storage keys — are optional. Each is a feature that hides itself when its key is absent, so
   leave any of them blank and add it later.

4. Apply. The first deploy takes about five minutes: it builds the image, runs
   the preflight, applies all 22 migrations and starts.

### 4. DNS

Two separate things, at whoever hosts DNS for `gaeilgeoirguides.com`.

**The portal itself.** Render gives the service a `.onrender.com` address once
it has deployed. Add one record:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `hub` | `<the-service>.onrender.com` |

Then in Render, **Settings → Custom Domain** → `hub.gaeilgeoirguides.com`.
The certificate is issued automatically once the record resolves, usually within
a few minutes.

**Email.** Resend gives three records for `send.gaeilgeoirguides.com` — an MX,
an SPF TXT and a DKIM TXT. Add them exactly as shown.

Nothing here touches the root domain, so existing mail is unaffected.

> If your DNS host adds the domain to names automatically, enter `hub` rather
> than `hub.gaeilgeoirguides.com` — entering the full name is the usual way to
> end up with `hub.gaeilgeoirguides.com.gaeilgeoirguides.com`.

### 5. The first administrator

There is nothing to do. A portal with no active administrator creates one at
boot from `ADMIN_NAME` and `ADMIN_EMAIL`, generates a password on the server,
and prints it once to the deploy log. Sign in with it and you are asked to
change it immediately, which is what makes the copy left in the log harmless.

Once anybody can sign in this never runs again, so it is safe to leave in place.

To add an administrator by hand later, `npm run create-admin` from the Render
shell still works.

---

## Deploying a change

Any push to `main` deploys. There is no other step:

```
git push
```

Render rebuilds, runs the preflight, applies any new migrations and restarts.
If the preflight fails the container refuses to start and the previous version
keeps serving, so a bad configuration cannot take the portal down.

Watch it in **Render → Logs**, or roll back from **Deploys → Rollback**.

---

## What runs on its own

| | When | Where |
| --- | --- | --- |
| Deadline reminders | `REMINDER_CRON` | In-process |
| Zoom recording sweep | `ZOOM_SWEEP_CRON` | In-process, only with Zoom keys set |
| Database + upload backup | 03:15 daily | `/var/data/backups`, 14 days kept |

### Getting it off the machine

Three layers, and the first two need no account that does not already exist.

**Render backs up the database itself.** Managed Postgres on a paid plan takes
its own daily backups, held by Render rather than on this server's disk. That
covers every student, grade, submission and piece of feedback — everything
except uploaded files. Confirm it under **the database → Backups** in the
dashboard; that is the single most valuable protection here and it was already
switched on.

**The nightly backup is emailed.** Set `BACKUP_EMAIL_TO` and both files arrive
in an inbox each morning, sent through the mail already configured. An inbox on
somebody else's servers is off the machine, which is the entire property that
matters. Keep one of those emails and the portal can be rebuilt from it.

This works because the files are small — tens of kilobytes for the database, a
few hundred for the coursework. It stops working the day they are not, so rather
than truncating silently, the message says so in its subject line and keeps
sending the database on its own for as long as that still fits. The database is
the last thing to be dropped, because it holds the grades.

### Off-site copies, once email is outgrown

The nightly backup also goes to object storage somewhere else, because a backup
living on the disk it is backing up is one failure away from being no backup.

Any S3-compatible provider works — the same code runs against Backblaze B2,
Cloudflare R2 or AWS. Set five variables in Render:

| Key | Example |
| --- | --- |
| `BACKUP_S3_ENDPOINT` | `https://s3.eu-central-003.backblazeb2.com` |
| `BACKUP_S3_BUCKET` | `gg-class-portal-backups` |
| `BACKUP_S3_KEY_ID` | from the provider |
| `BACKUP_S3_SECRET` | from the provider |
| `BACKUP_S3_REGION` | `auto`, or the provider's region |

Leave them blank and the backup stays local-only, exactly as before — off-site
is an addition, never a dependency. A storage outage cannot stop the backup that
would otherwise have been taken; it is recorded as a problem and the local copy
is still written.

### Proving it works

A backup nobody has ever restored is a hope. From the Render shell:

```
npm run check-backup
```

It writes a test object, reads it back and compares it, takes a real backup,
pushes it, and lists what is up there. The read-back matters: a key with write
but not read permission looks perfectly healthy every night and fails on the one
morning it is needed.

### Restoring

```
gunzip -c gg-2026-03-19T0315-database.sql.gz | psql "$DATABASE_URL"
tar -xzf gg-2026-03-19T0315-files.tar.gz -C /var/data
```

Restore into an empty database rather than over a live one.

---

## Costs

| | |
| --- | --- |
| Web service, Starter | $7.00/mo |
| Postgres, Basic 256MB | $10.50/mo |
| Disk, 5GB | $1.25/mo |
| Resend | Free below 3,000 emails/mo |
| Backup storage | Under $1/mo, often free |
| **Total** | **~$19/mo** |

The database plan is the one to watch. 256MB is generous for text but recordings
are not in it — they are on Bunny or YouTube — so it should last a long time.

---

## If something is wrong

**The container will not start.** Read the top of the Render log. The preflight
prints one plain line per problem and exits, so the reason is stated rather than
implied.

**Email is not arriving.** Check Resend's own dashboard first, which shows every
attempt and why it bounced. If nothing appears there at all, `SMTP_PASSWORD` is
wrong or the domain is not verified.

**Uploads vanish after a deploy.** The disk is not mounted, or `UPLOAD_DIR` does
not point under `/var/data`. Both are set in `render.yaml`.

**The portal is slow to wake.** Starter instances do not sleep; the free tier
does. Check the plan has not been changed.
