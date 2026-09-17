// Reusable pronunciation-practice card, factored out of the live dashboard so
// both the Zoom overlay and the video-lesson player share ONE implementation of
// the app's practice mechanism (live PCM streaming to Azure ga-IE, the app's
// evaluatePartial grading, verdict + sounds + TTS replay + the 4 action tiles).
//
// createPractice({ glowEl, onPass, onFail, onSkip }) builds its own DOM and
// returns { el, show, hide, get active }. Mount el inside a position:relative
// container over the video; glowEl (default: that container) receives the
// amplitude vignette.
import { evaluatePartial } from '/live/scoring.js';

const CARD_HTML = `
<div class="phrasecard" style="display:none">
  <div class="verdict js-verdict"></div>
  <div class="irish js-irish"></div>
  <div class="english js-english"></div>
  <div class="phonetic js-phonetic"></div>
  <div class="actions">
    <button class="abtn js-skip" type="button"><span class="abox"><svg viewBox="0 0 24 24"><path d="M16,18H18V6H16M6,18L14.5,12L6,6V18Z"/></svg></span><span class="albl">Skip</span></button>
    <button class="abtn js-phon" type="button"><span class="abox"><svg viewBox="0 0 24 24"><path d="M9,5A4,4 0 0,1 13,9A4,4 0 0,1 9,13A4,4 0 0,1 5,9A4,4 0 0,1 9,5M9,15C11.67,15 17,16.34 17,19V21H1V19C1,16.34 6.33,15 9,15M16.76,5.36C18.78,7.56 18.78,10.61 16.76,12.63L15.08,10.94C15.92,9.76 15.92,8.23 15.08,7.05L16.76,5.36M20.07,2C24,6.05 23.97,12.11 20.07,16L18.44,14.37C21.21,11.19 21.21,6.65 18.44,3.63L20.07,2Z"/></svg></span><span class="albl">Phonetics</span></button>
    <button class="abtn js-slow" type="button"><span class="abox"><svg viewBox="0 0 24 24"><path d="M20.31 8.03L21.24 4.95C21.67 4.85 22 4.47 22 4C22 3.45 21.55 3 21 3S20 3.45 20 4C20 4.26 20.11 4.5 20.27 4.68L19.5 7.26L18.73 4.68C18.89 4.5 19 4.26 19 4C19 3.45 18.55 3 18 3S17 3.45 17 4C17 4.47 17.33 4.85 17.76 4.95L18.69 8.03C17.73 8.18 17 9 17 10V12.25C15.65 9.16 12.63 7 9.11 7C5.19 7 2 10.26 2 14.26C2 16.1 2.82 17.75 4.1 18.85L2.88 19C2.38 19.06 2 19.5 2 20C2 20.55 2.45 21 3 21L19.12 21C20.16 21 21 20.16 21 19.12V11.72C21.6 11.38 22 10.74 22 10C22 9 21.27 8.18 20.31 8.03M15.6 17.41L12.07 17.86C12.5 17.1 12.8 16.21 12.8 15.26C12.8 12.94 10.95 11.06 8.67 11.06C8.14 11.06 7.62 11.18 7.14 11.41C6.65 11.66 6.44 12.26 6.69 12.75C6.93 13.25 7.53 13.45 8.03 13.21C8.23 13.11 8.45 13.06 8.67 13.06C9.85 13.06 10.8 14.04 10.8 15.26C10.8 16.92 9.5 18.27 7.89 18.27C5.75 18.27 4 16.47 4 14.26C4 11.36 6.29 9 9.11 9C12.77 9 15.75 12.06 15.75 15.82C15.75 16.36 15.69 16.89 15.6 17.41Z"/></svg></span><span class="albl">Slow</span></button>
    <button class="abtn js-replay" type="button"><span class="abox"><svg viewBox="0 0 24 24"><path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z"/></svg></span><span class="albl">Replay</span></button>
  </div>
  <button class="bigmic js-mic" type="button">
    <span class="halo"></span>
    <svg class="mic-ic ic-mic" viewBox="0 0 24 24"><path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/></svg>
    <svg class="mic-ic ic-check" viewBox="0 0 24 24"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>
    <svg class="mic-ic ic-x" viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>
    <span class="viz"><i></i><i></i><i></i><i></i></span>
  </button>
  <div class="micerr js-micerr"></div>
</div>`;

const VERDICT_TEXT = {
  correct: 'Excellent Pronunciation',
  goodEffort: 'Fair Pronunciation',
  incorrect: 'Pronunciation needs work'
};

export function createPractice(opts = {}) {
  const { onPass, onFail, onSkip } = opts;

  const root = document.createElement('div');
  root.className = 'gg-practice';
  root.innerHTML = CARD_HTML;
  const glowEl = opts.glowEl || root;

  // Stained-glass backdrop + amplitude vignette live inside the glow element
  // (the video wrapper), behind the card.
  const glass = document.createElement('div');
  glass.className = 'gg-glass';
  glowEl.appendChild(glass);
  const vignette = document.createElement('div');
  vignette.className = 'gg-vignette';
  glowEl.appendChild(vignette);

  const $ = (s) => root.querySelector(s);
  const card = $('.phrasecard');
  const irishEl = $('.js-irish');
  const englishEl = $('.js-english');
  const phoneticEl = $('.js-phonetic');
  const verdictEl = $('.js-verdict');
  const micBtn = $('.js-mic');
  const micErr = $('.js-micerr');
  const skipBtn = $('.js-skip');
  const phoneticsBtn = $('.js-phon');
  const slowBtn = $('.js-slow');
  const replayBtn = $('.js-replay');
  const vizBars = [...root.querySelectorAll('.viz i')];

  const sndSuccess = new Audio('/sounds/success_sound.mp3');
  const sndIncorrect = new Audio('/sounds/incorrect_sound.mp3');

  let currentTarget = '';
  let currentPhraseData = null;
  let showPhon = false;
  let isSlow = localStorage.getItem('gglive_slow') === '1';
  if (isSlow) slowBtn.classList.add('active');

  let practiceState = 'idle'; // idle | listening | verdict
  let ws = null, recStream = null, srcNode = null, procNode = null, silentGain = null;
  let audioCtx = null, ampRAF = null;
  let locked = [], finished = false, colourDelay = 0;
  let keepTryingTimer = null, maxTimer = null, verdictTimer = null, hideTimer = null;
  let replayAudio = null;

  function setGlow(cls) {
    glowEl.classList.remove('gg-glow-listening', 'gg-glow-green', 'gg-glow-red');
    if (cls) glowEl.classList.add(cls);
  }
  function updateQuoteLine() {
    if (!currentPhraseData) return;
    const text = showPhon && currentPhraseData.phonetic ? currentPhraseData.phonetic : currentPhraseData.english;
    englishEl.textContent = text ? '“' + text + '”' : '';
    englishEl.style.display = text ? 'block' : 'none';
  }
  function setMic(state, label) {
    practiceState = state;
    micBtn.className = 'bigmic js-mic' + (state === 'listening' ? ' listening' : '') + (state === 'verdict' ? ' v-' + label : '');
    if (state !== 'listening') {
      // Clear the glow; showVerdict re-adds the green/red glow right after this.
      setGlow(null);
      vignette.style.boxShadow = '';
      for (const b of vizBars) b.style.height = '10px';
    }
    if (state === 'listening') { setGlow('gg-glow-listening'); verdictEl.textContent = 'Speak Now'; verdictEl.className = 'verdict js-verdict on speak'; }
    else if (state === 'idle' && verdictEl.classList.contains('speak')) verdictEl.className = 'verdict js-verdict';
  }
  function clearWordColours() { for (const s of irishEl.children) s.className = ''; }

  function stopHardware() {
    clearTimeout(keepTryingTimer); clearTimeout(maxTimer);
    if (ampRAF) cancelAnimationFrame(ampRAF); ampRAF = null;
    if (ws) { try { ws.onmessage = null; ws.onerror = null; ws.close(); } catch {} ws = null; }
    if (procNode) { try { procNode.disconnect(); procNode.onaudioprocess = null; } catch {} procNode = null; }
    if (srcNode) { try { srcNode.disconnect(); } catch {} srcNode = null; }
    if (silentGain) { try { silentGain.disconnect(); } catch {} silentGain = null; }
    if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
    if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }
  }
  function resetPractice(clearAll) {
    clearTimeout(verdictTimer);
    finished = true;
    stopHardware();
    locked = []; colourDelay = 0;
    if (replayAudio) { try { replayAudio.pause(); } catch {} replayAudio = null; }
    replayBtn.disabled = false; replayBtn.classList.remove('playing');
    micErr.style.display = 'none';
    verdictEl.className = 'verdict js-verdict';
    setGlow(null);
    setMic('idle');
    if (clearAll) clearWordColours();
  }
  function practiceError(msg) { resetPractice(false); micErr.textContent = msg; micErr.style.display = 'block'; }

  function paintWord(i, grade) {
    const spans = [...irishEl.children];
    const delay = colourDelay; colourDelay += 150;
    setTimeout(() => { if (spans[i]) spans[i].className = grade + ' hit'; }, delay);
    setTimeout(() => { colourDelay = Math.max(0, colourDelay - 150); }, delay + 150);
  }
  function downsampleTo16k(f32, fromRate) {
    if (fromRate === 16000) return f32;
    const ratio = fromRate / 16000;
    const n = Math.floor(f32.length / ratio);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = f32[Math.floor(i * ratio)];
    return out;
  }

  async function startListening() {
    micErr.style.display = 'none';
    verdictEl.className = 'verdict js-verdict';
    clearWordColours();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return practiceError('This browser cannot use the microphone. Try Chrome, Edge or Safari.');
    }
    try {
      recStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
    } catch { return practiceError('Allow microphone access in your browser to practise.'); }
    finished = false;
    locked = new Array(currentTarget.split(/\s+/).filter(Boolean).length).fill(null);
    colourDelay = 0;

    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host + '/api/live/speech');
    ws.binaryType = 'arraybuffer';
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'text') onSpeechText(m.fullText);
      else if (m.type === 'error' && practiceState === 'listening') practiceError('Could not reach the speech service. Try again.');
    };

    // Safari (and iOS especially) still exposes webkitAudioContext, ignores a
    // requested sampleRate, and starts the context SUSPENDED until a gesture —
    // the mic tap is that gesture, so resume here or no audio ever flows.
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return practiceError('This browser cannot record audio. Try Chrome, Edge or Safari.');
    try { audioCtx = new AC({ sampleRate: 16000 }); } catch { audioCtx = new AC(); }
    if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch {} }
    srcNode = audioCtx.createMediaStreamSource(recStream);

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    srcNode.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const pump = () => {
      if (practiceState !== 'listening') return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
      const amp = Math.min(1, Math.sqrt(sum / buf.length) * 4);
      vignette.style.boxShadow = `inset 0 0 ${55 + amp * 95}px ${8 + amp * 22}px rgba(80,175,55,${0.45 + amp * 0.4})`;
      const mult = [0.6, 1.0, 0.8, 0.5];
      vizBars.forEach((b, k) => { b.style.height = (10 + 30 * amp * mult[k]) + 'px'; });
      ampRAF = requestAnimationFrame(pump);
    };

    procNode = audioCtx.createScriptProcessor(4096, 1, 1);
    silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    srcNode.connect(procNode);
    procNode.connect(silentGain);
    silentGain.connect(audioCtx.destination);
    procNode.onaudioprocess = e => {
      if (finished || practiceState !== 'listening') return;
      const ds = downsampleTo16k(e.inputBuffer.getChannelData(0), audioCtx.sampleRate);
      const pcm = new Int16Array(ds.length);
      for (let i = 0; i < ds.length; i++) { const s = Math.max(-1, Math.min(1, ds[i])); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; }
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(pcm.buffer);
    };

    setMic('listening');
    pump();
    keepTryingTimer = setTimeout(() => { if (practiceState === 'listening') verdictEl.textContent = 'Keep Trying'; }, 5000);
    maxTimer = setTimeout(() => { if (practiceState === 'listening') finalize(); }, 30000);
  }

  function onSpeechText(fullText) {
    if (practiceState !== 'listening' || finished) return;
    const words = currentTarget.split(/\s+/).filter(Boolean);
    const res = evaluatePartial(words, locked, fullText);
    for (const i of res.changed) paintWord(i, res.locked[i]);
    locked = res.locked;
    if (locked.length && !locked.includes(null)) pass();
  }
  function pass() {
    finished = true;
    stopHardware();
    showVerdict(locked.includes('goodEffort') ? 'goodEffort' : 'correct');
  }
  function finalize() {
    if (practiceState !== 'listening') return;
    finished = true;
    stopHardware();
    const spans = [...irishEl.children];
    locked = locked.map((g, i) => {
      if (g == null) { setTimeout(() => { if (spans[i]) spans[i].className = 'wrong hit'; }, colourDelay + i * 80); return 'wrong'; }
      return g;
    });
    const verdict = locked.includes('wrong') ? 'incorrect' : locked.includes('goodEffort') ? 'goodEffort' : 'correct';
    setTimeout(() => showVerdict(verdict), colourDelay + 300);
  }
  function showVerdict(verdict) {
    const target = currentTarget;
    verdictEl.textContent = VERDICT_TEXT[verdict];
    verdictEl.className = 'verdict js-verdict on ' + verdict;
    setMic('verdict', verdict);
    setGlow(verdict === 'incorrect' ? 'gg-glow-red' : 'gg-glow-green');
    try { (verdict === 'incorrect' ? sndIncorrect : sndSuccess).cloneNode().play(); } catch {}
    verdictTimer = setTimeout(() => {
      if (currentTarget !== target) return;
      setGlow(null);
      if (verdict === 'incorrect') {
        // Missed it: keep the card up for another go (the video stays paused).
        clearWordColours();
        verdictEl.className = 'verdict js-verdict';
        setMic('idle');
        onFail && onFail(verdict);
      } else {
        // Nailed it: the card leaves and the caller resumes the video.
        onPass && onPass(verdict);
        hide();
      }
    }, verdict === 'incorrect' ? 1800 : 2000);
  }

  micBtn.addEventListener('click', () => {
    if (!currentTarget) return;
    if (practiceState === 'idle') startListening();
    else if (practiceState === 'listening') finalize();
  });

  async function playReplay() {
    if (!currentTarget) return;
    const voiceId = localStorage.getItem('gglive_voice') || '';
    replayBtn.classList.add('playing');
    try {
      if (replayAudio) { replayAudio.pause(); replayAudio = null; }
      replayAudio = new Audio('/api/live/tts?text=' + encodeURIComponent(currentTarget) + '&voice=' + encodeURIComponent(voiceId));
      replayAudio.playbackRate = isSlow ? 0.65 : 1.0;
      replayAudio.onended = replayAudio.onerror = () => replayBtn.classList.remove('playing');
      await replayAudio.play();
    } catch { replayBtn.classList.remove('playing'); }
  }
  replayBtn.addEventListener('click', playReplay);
  slowBtn.addEventListener('click', () => {
    isSlow = !isSlow;
    localStorage.setItem('gglive_slow', isSlow ? '1' : '0');
    slowBtn.classList.toggle('active', isSlow);
    playReplay();
  });
  phoneticsBtn.addEventListener('click', async () => {
    if (!currentPhraseData) return;
    showPhon = !showPhon;
    phoneticsBtn.classList.toggle('active', showPhon);
    if (showPhon && !currentPhraseData.phonetic) {
      englishEl.textContent = '“…”';
      try {
        const r = await fetch('/api/live/phonetics?text=' + encodeURIComponent(currentPhraseData.irish)).then(x => x.json());
        if (r.phonetic) currentPhraseData.phonetic = r.phonetic;
      } catch {}
    }
    updateQuoteLine();
  });
  skipBtn.addEventListener('click', () => {
    if (!currentTarget) return;
    onSkip && onSkip();
    hide();
  });

  function show(phrase) {
    clearTimeout(hideTimer);
    resetPractice(true);
    currentTarget = phrase.irish;
    currentPhraseData = { irish: phrase.irish, english: phrase.english || '', phonetic: phrase.phonetic || '' };
    showPhon = false;
    phoneticsBtn.classList.remove('active');
    irishEl.innerHTML = '';
    for (const w of phrase.irish.split(/\s+/)) { const s = document.createElement('span'); s.textContent = w; irishEl.appendChild(s); }
    phoneticEl.style.display = 'none';
    updateQuoteLine();
    card.style.display = 'block';
    card.classList.remove('out', 'pop');
    void card.offsetWidth;
    card.classList.add('pop');
    glass.classList.add('on');
    root.style.pointerEvents = 'none'; // only the card catches clicks
  }
  function hide() {
    clearTimeout(hideTimer);
    resetPractice(true);
    currentTarget = '';
    glass.classList.remove('on');
    if (card.style.display !== 'none') {
      card.classList.remove('pop'); card.classList.add('out');
      hideTimer = setTimeout(() => { card.style.display = 'none'; card.classList.remove('out'); }, 180);
    }
  }

  return { el: root, show, hide, get active() { return currentTarget !== ''; } };
}
