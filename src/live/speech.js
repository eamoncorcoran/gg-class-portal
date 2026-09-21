/**
 * The live mic: the browser streams raw PCM16 at 16 kHz over a WebSocket, this
 * speaks Azure Speech's own websocket protocol upstream (language ga-IE) and
 * forwards recognised text back down. The Azure key stays server-side; the
 * grading runs in the browser on each update.
 *
 * The socket arrives as an HTTP upgrade with no Express in front of it, so the
 * portal session is read straight off the Cookie header.
 */
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket as WSClient } from 'ws';
import { sessionUser, sessionTokenFromCookieHeader } from '../session.js';
import { getSpeechConfig } from '../settings.js';

export const SPEECH_PATH = '/api/live/speech';

export async function speechConfigured() { return (await getSpeechConfig()).azureConfigured; }

function wavHeader16k() {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0); b.writeUInt32LE(0xffffffff, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(0xffffffff, 40);
  return b;
}
function wrapAudio(requestId, data) {
  const header = Buffer.from(`path: audio\r\nx-requestid: ${requestId}\r\nx-timestamp: ${new Date().toISOString()}\r\ncontent-type: audio/x-wav\r\n\r\n`, 'utf8');
  const out = Buffer.alloc(2 + header.length + data.length);
  out.writeUInt16BE(header.length, 0);
  header.copy(out, 2);
  data.copy(out, 2 + header.length);
  return out;
}

export function attachSpeechRelay(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', async (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* below */ }
    if (pathname !== SPEECH_PATH) { socket.destroy(); return; }
    let user = null;
    try { user = await sessionUser(sessionTokenFromCookieHeader(req.headers.cookie)); } catch { user = null; }
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (client) => wss.emit('connection', client, req, user));
  });

  wss.on('connection', async (client) => {
    const { azureKey, azureRegion } = await getSpeechConfig();
    if (!azureKey) {
      client.send(JSON.stringify({ type: 'error', message: 'The mic is not set up on this portal yet.' }));
      client.close();
      return;
    }
    const requestId = crypto.randomBytes(16).toString('hex');
    const connectionId = crypto.randomBytes(16).toString('hex');
    const url = `wss://${azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ga-IE&format=simple&Ocp-Apim-Subscription-Key=${azureKey}&X-ConnectionId=${connectionId}`;

    /* A mic press that lands on a DNS blip used to fail on the spot. The audio
       is held in `pending` while the connection is made, so a retry loses
       nothing the student has said. */
    let azure = null, azureOpen = false, sentWavHeader = false, finalized = '', attempt = 0, clientGone = false;
    const pending = [];
    const RETRY_AFTER_MS = [500, 1500];

    function onAzureMessage(data, isBinary) {
      if (isBinary) return;
      const msg = data.toString();
      const idx = msg.indexOf('\r\n\r\n');
      if (idx < 0) return;
      try {
        const body = JSON.parse(msg.slice(idx + 4));
        if (body.RecognitionStatus === 'Success') {
          finalized += (body.DisplayText || '') + ' ';
          client.send(JSON.stringify({ type: 'text', fullText: finalized, final: true }));
        } else if (body.Text !== undefined) {
          client.send(JSON.stringify({ type: 'text', fullText: finalized + (body.Text || ''), final: false }));
        }
      } catch { /* keep-alive frames etc. */ }
    }
    function connectAzure() {
      attempt += 1;
      azure = new WSClient(url, { handshakeTimeout: 6000 });
      azure.on('open', () => {
        azureOpen = true;
        azure.send(`path: speech.config\r\nx-requestid: ${requestId}\r\nx-timestamp: ${new Date().toISOString()}\r\ncontent-type: application/json; charset=utf-8\r\n\r\n` +
          '{"context":{"system":{"name":"GaeilgeoirLive","version":"2.0.0"}}}');
        for (const p of pending) azure.send(p);
        pending.length = 0;
      });
      azure.on('message', onAzureMessage);
      azure.on('error', (err) => {
        console.error(`azure speech error (attempt ${attempt}):`, err?.message);
        if (!azureOpen && attempt <= RETRY_AFTER_MS.length && !clientGone) { setTimeout(connectAzure, RETRY_AFTER_MS[attempt - 1]); return; }
        try { client.send(JSON.stringify({ type: 'error', message: 'The speech service could not be reached. Check your connection and press the mic again.' })); } catch { /* gone */ }
      });
      azure.on('close', () => {
        if (!azureOpen && attempt <= RETRY_AFTER_MS.length && !clientGone) return;
        try { client.send(JSON.stringify({ type: 'closed' })); } catch { /* gone */ }
      });
    }
    connectAzure();

    client.on('message', (data, isBinary) => {
      if (!isBinary) return;
      const chunks = [];
      if (!sentWavHeader) { sentWavHeader = true; chunks.push(wrapAudio(requestId, wavHeader16k())); }
      chunks.push(wrapAudio(requestId, Buffer.from(data)));
      for (const c of chunks) {
        if (azureOpen && azure.readyState === WSClient.OPEN) azure.send(c); else pending.push(c);
      }
    });
    client.on('close', () => { clientGone = true; try { azure && azure.close(); } catch { /* gone */ } });
  });
  return wss;
}
