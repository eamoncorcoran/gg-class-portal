# Launching on Hostinger

About 30 minutes, most of it waiting for DNS.

## Before you start

**You need a Hostinger VPS, not web hosting.** Hostinger's Premium and Business
plans run PHP only. This portal needs Node and PostgreSQL, which those plans
cannot run. Any VPS plan is enough — the smallest one has more than it needs.

**Use a subdomain that is free.** `portal.gaeilgeoirguides.com` is already
pointed at your existing client portal, so it cannot be used here. These are all
free right now:

- `homework.gaeilgeoirguides.com` ← matches what students see on the sign-in page
- `students.gaeilgeoirguides.com`
- `obair.gaeilgeoirguides.com`

The rest of this guide uses `homework.gaeilgeoirguides.com`. If you pick a
different one, change it everywhere it appears.

---

## 1. Create the server

In hPanel, order a VPS. When it asks for the operating system, choose the
**Ubuntu template that already includes Docker** (under Applications). That
saves installing it yourself.

Write down the **IP address** and the **root password** it gives you.

In the VPS firewall settings, make sure ports **80** and **443** are open.

## 2. Point the subdomain at it

Your DNS is at **Hover**, not Hostinger, so this is done in the Hover control
panel — not hPanel.

Add one record:

| Type | Hostname   | Value                 |
| ---- | ---------- | --------------------- |
| A    | `homework` | your VPS IP address   |

Give it 15 minutes. Check it has taken effect:

```bash
dig +short homework.gaeilgeoirguides.com
```

When that prints your VPS IP, carry on. **Do not continue before it does** —
the certificate step will fail and Let's Encrypt limits how often you can retry.

## 3. Put the code on the server

From your Mac, in the project folder:

```bash
cd /Users/eamoncorcoran/gaeilgeoir-guides && git archive --format=tar.gz -o /tmp/portal.tar.gz HEAD
```

Send it up, replacing `YOUR_IP`:

```bash
scp /tmp/portal.tar.gz root@YOUR_IP:/root/
```

Now log in to the server:

```bash
ssh root@YOUR_IP
```

Everything from here runs **on the server**:

```bash
mkdir -p /opt/portal && tar -xzf /root/portal.tar.gz -C /opt/portal && cd /opt/portal
```

## 4. Write the settings file

Still on the server, this generates the two secrets and writes everything else
for you:

```bash
cd /opt/portal && printf 'NODE_ENV=production\nPORT=3000\nAPP_URL=https://homework.gaeilgeoirguides.com\nAPP_DOMAIN=homework.gaeilgeoirguides.com\nPOSTGRES_PASSWORD=%s\nAPP_ENCRYPTION_KEY=%s\nSESSION_COOKIE_NAME=gg_session\nSESSION_DAYS=90\nUPLOAD_DIR=./uploads\nPRIVATE_UPLOAD_DIR=./uploads-private\nMAX_UPLOAD_MB=20\nDEFAULT_TIMEZONE=Europe/Dublin\nEMAIL_PROVIDER=console\nEMAIL_FROM_NAME=Gaeilgeoir Guides\nEMAIL_FROM_ADDRESS=support@gaeilgeoirguides.com\nEMAIL_REPLY_TO=support@gaeilgeoirguides.com\nOPENAI_API_KEY=\nOPENAI_MODEL=gpt-5.6\nREMINDER_CRON=*/5 * * * *\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > .env && chmod 600 .env && echo "Settings written."
```

Email and OpenAI are deliberately left blank. Step 7 turns them on.

## 5. Start it

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml up -d --build
```

The first run takes a few minutes: it builds the app, starts PostgreSQL, sets up
the database, and gets your HTTPS certificate. Watch it:

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml logs -f
```

Press `Ctrl+C` to stop watching (that does not stop the app).

When you see the app reporting it is running, open
**https://homework.gaeilgeoirguides.com** in a browser. You should get the
sign-in page with the padlock.

## 6. Create your account

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml exec -it app node scripts/create-admin.js
```

It asks for your name, email and a password, twice. The password is not shown as
you type and is not stored in your shell history. Use a strong one — this account
can see every student's work. Then sign in with it.

## 7. Turn on AI and email

Both are set from inside the app now that it is running.

**OpenAI** — sign in, go to *OpenAI & prompts*, paste your API key from
platform.openai.com, and save. Until you do this, the Regenerate and AI
correction buttons will tell you the key is missing. The key is encrypted before
it is stored and is never sent to the browser.

**Email** — until this is set, nothing actually sends. Invitations, password
resets and deadline reminders will only appear in the server logs, so students
will never receive their login details.

On the server, add your mail settings to `.env`:

```bash
cd /opt/portal && nano .env
```

Change `EMAIL_PROVIDER=console` to `EMAIL_PROVIDER=smtp` and fill in the four
SMTP lines. If your mail is with Hostinger, the settings are on the Emails page
in hPanel and look like this:

```
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=support@gaeilgeoirguides.com
SMTP_PASSWORD=your-mailbox-password
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`. Apply it:

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml up -d
```

Then add one test student in the app with your own email address, and check the
invitation arrives. **Do this before you add the real class** — a wrong SMTP
password is silent from the student's side.

---

## Running it day to day

Everything below runs on the server, from `/opt/portal`.

**See what is happening**

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml logs --tail 100 app
```

**Restart**

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml restart app
```

**Backups run on their own, every night at 3:15am.** Each night writes two
files: the database, and the work students uploaded. Fourteen days are kept and
older ones are deleted.

To take one right now, before an update:

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml exec app npm run backup
```

To see what you have:

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml exec app ls -lh backups
```

**Copy them off the server.** A backup that only lives on the machine it protects
is not a backup. From your Mac:

```bash
scp -r root@YOUR_IP:/var/lib/docker/volumes/portal_backups_data/_data/ ~/Desktop/portal-backups/
```

Put that command in a reminder, or on a schedule of its own. Nothing on the
server can protect you from losing the server.

**To restore**, unzip the database file and feed it back in:

```bash
cd /opt/portal && gunzip -c backups/gg-2026-08-16T0315-database.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U postgres gaeilgeoir_support
```

**Update to a new version.** Build a fresh tarball on your Mac exactly as in
step 3, send it up, then on the server:

```bash
cd /opt/portal && tar -xzf /root/portal.tar.gz -C /opt/portal && docker compose -f docker-compose.prod.yml up -d --build
```

Your database, student files and certificate are on separate volumes and are not
touched by this.

---

## If something goes wrong

**The site does not load at all.** Check DNS actually points at the VPS
(`dig +short homework.gaeilgeoirguides.com`) and that ports 80 and 443 are open
in the Hostinger firewall. Caddy cannot get a certificate without both.

**"Your connection is not private."** The certificate has not been issued yet.
Look at the Caddy log:

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml logs caddy | tail -30
```

Almost always this is DNS not having reached the server yet, or port 80 being
blocked.

**It starts and immediately stops.** The app checks its own settings before it
starts and refuses to run on a broken configuration. The reason is the last line
of the log:

```bash
cd /opt/portal && docker compose -f docker-compose.prod.yml logs app | tail -20
```

**Signing in does nothing.** This means the site is being served over plain HTTP.
The session cookie is marked Secure in production, so the browser will not send
it back over an insecure connection. Use the `https://` address.

**Students say they never got their email.** Check `EMAIL_PROVIDER` in `.env`.
If it still says `console`, no email has ever left the server.
