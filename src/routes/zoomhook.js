import { Router } from 'express';
import express from 'express';
import { asyncRoute } from '../middleware.js';
import { verifyWebhook, urlValidationReply } from '../zoom.js';
import { importWatched } from '../zoomimport.js';
import { config } from '../config.js';
import { audit } from '../audit.js';

/**
 * Zoom's webhook.
 *
 * The only route in the application without a session behind it, so the
 * signature is the whole of the security. It is checked before anything is read
 * out of the body, and a missing secret means every request is refused: an
 * unauthenticated endpoint that creates lessons would be worse than having no
 * webhook at all.
 *
 * Even past the signature, this cannot import anything that has not already been
 * named for automatic import. A forged or replayed event therefore achieves
 * nothing beyond a wasted database query.
 */
const router = Router();

/* Raw body, because a signature over a re-serialised object is a signature over
   something Zoom never sent. */
router.post('/', express.raw({ type: '*/*', limit: '1mb' }), asyncRoute(async (req, res) => {
  const rawBody = req.body?.toString('utf8') || '';

  if (!config.zoom.webhookSecret) return res.status(503).json({ error: 'Not configured.' });
  const valid = verifyWebhook({
    signature: req.get('x-zm-signature'),
    timestamp: req.get('x-zm-request-timestamp'),
    rawBody,
  });
  if (!valid) {
    await audit({ action: 'zoom.webhook_rejected', entityType: 'zoom', ip: req.ip });
    return res.status(401).json({ error: 'Bad signature.' });
  }

  let payload = {};
  try { payload = JSON.parse(rawBody); } catch { return res.status(400).json({ error: 'Bad payload.' }); }

  // Zoom proves it owns the endpoint by asking us to sign a nonce back.
  if (payload.event === 'endpoint.url_validation') {
    return res.json(urlValidationReply(payload.payload?.plainToken));
  }

  if (payload.event === 'recording.completed') {
    const meetingId = payload.payload?.object?.id;
    /* Answered immediately and the work done after. Zoom retries anything it
       does not get a prompt reply to, and a 90-minute upload is not a prompt
       reply. */
    res.json({ ok: true });
    importWatched({ meetingId })
      .then((result) => {
        if (result.imported) console.log(`Zoom import: ${result.imported} recording(s) from meeting ${meetingId}`);
      })
      .catch((error) => console.error('Zoom webhook import failed', error));
    return undefined;
  }

  return res.json({ ok: true, ignored: payload.event });
}));

export default router;
