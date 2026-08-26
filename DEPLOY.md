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

   The rest — `OPENAI_API_KEY`, `GIPHY_API_KEY`, the Bunny keys, the Zoom keys —
   are optional. Each is a feature that hides itself when its key is absent, so
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

The database starts empty. From **Render → Shell** on the running service:

```
npm run create-admin
```

It asks for a name, an email and a password, and nothing is echoed. That account
can then create every other administrator from the Administrators screen.

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

The backup writes to the same disk as the thing it is backing up, which protects
against a mistake but not against losing the disk. If that matters, download one
periodically from the Render shell, or say the word and I will push them to
off-site storage.

---

## Costs

| | |
| --- | --- |
| Web service, Starter | $7/mo |
| Postgres, Basic 256MB | $7/mo |
| Disk, 5GB | ~$1.25/mo |
| Resend | Free below 3,000 emails/mo |
| **Total** | **~$15/mo** |

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
