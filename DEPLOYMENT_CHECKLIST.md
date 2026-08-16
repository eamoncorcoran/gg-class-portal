# Deployment checklist

## Infrastructure

- [ ] Production PostgreSQL created
- [ ] Database backups enabled
- [ ] HTTPS domain connected
- [ ] `APP_URL` matches the HTTPS domain exactly
- [ ] `NODE_ENV=production`
- [ ] Strong `APP_ENCRYPTION_KEY` configured
- [ ] Persistent upload storage configured
- [ ] Health check points to `/api/health`

## Administrator

- [ ] Database migrations completed
- [ ] Administrator account created
- [ ] Administrator password stored securely
- [ ] Initial Monday and Thursday class groups created

## Email

- [ ] Sender domain authenticated
- [ ] From address configured
- [ ] Reply-to address configured
- [ ] Student invitation tested
- [ ] Password reset tested
- [ ] Password changed confirmation tested
- [ ] Due tomorrow reminder tested
- [ ] Due in two hours reminder tested
- [ ] Due in 30 minutes reminder tested
- [ ] Failed email delivery is visible in logs

## OpenAI

- [ ] Server-side API key configured
- [ ] Model connection test passed
- [ ] Check-in prompt reviewed
- [ ] Correction prompt reviewed against An Caighdeán Oifigiúil
- [ ] General feedback prompt reviewed
- [ ] Test submission with genuine errors reviewed
- [ ] Test submission with no errors returns `No Irish corrections needed.`
- [ ] No draft is generated for missing work

## Student lifecycle

- [ ] Add one test student
- [ ] Invitation email received
- [ ] Temporary password works
- [ ] First-login password change is forced
- [ ] Session remains active after browser restart
- [ ] Forgot-password email works
- [ ] Reset link expires and cannot be reused
- [ ] Password change invalidates other sessions

## Course operations

- [ ] Attendance CSV imported
- [ ] Live attendance icon is green with camera
- [ ] Non-live attendance icon is red with X
- [ ] Friday 3:00pm check-in release verified
- [ ] Future weeks are hidden from students
- [ ] Check-in autosave verified
- [ ] Homework autosave verified
- [ ] Hard deadline verified
- [ ] Assignment reopening verified
- [ ] Returned feedback notification verified
- [ ] Enter submits teacher feedback
- [ ] Shift + Enter adds a line
- [ ] Arrow-key review navigation verified

## Pilot

- [ ] Run with a small pilot class
- [ ] Review error logs daily
- [ ] Review audit logs
- [ ] Confirm email deliverability
- [ ] Confirm reminder timing in Europe/Dublin
- [ ] Collect student usability feedback
- [ ] Back up production database before full rollout
