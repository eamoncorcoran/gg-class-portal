// Lesson sounds made on the spot with the Web Audio API, so there are no files to load: a soft tap,
// a two-note chime for right, a low thud for wrong, a tick as XP lands, and a short fanfare at the end.
// Speech goes through the server's narrator (Azure voices) and falls back to the browser's own.
let ctx: AudioContext | null = null;
const ac = () => {
    if (typeof AudioContext === "undefined") return null;
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
};
let muted = false;
export const setMuted = (m: boolean) => (muted = m);

const tone = (freq: number, at: number, dur: number, type: OscillatorType = "sine", gain = 0.18) => {
    const c = ac();
    if (!c || muted) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + at);
    g.gain.setValueAtTime(0, c.currentTime + at);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + at + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + at);
    o.stop(c.currentTime + at + dur + 0.05);
};

export const sfx = {
    tap: () => tone(880, 0, 0.06, "triangle", 0.06),
    place: () => (tone(660, 0, 0.07, "triangle", 0.07), tone(990, 0.04, 0.08, "triangle", 0.05)),
    right: () => (tone(659, 0, 0.18, "sine", 0.16), tone(988, 0.11, 0.26, "sine", 0.16), tone(1319, 0.22, 0.34, "sine", 0.12)),
    wrong: () => (tone(196, 0, 0.22, "sawtooth", 0.08), tone(147, 0.1, 0.3, "sawtooth", 0.07)),
    xp: () => (tone(1760, 0, 0.05, "square", 0.04), tone(2093, 0.05, 0.08, "square", 0.04)),
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, "sine", 0.14)),
};

/* ---------------- the narrator ---------------- */
let current: HTMLAudioElement | null = null;
const clips = new Map<string, string>(); // text -> object url, this session

export const stopSpeech = () => {
    current?.pause();
    current = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
};

/** Say a line: Irish with the Irish voice, otherwise the Irish-English one; the browser's voice if the server has none. */
export async function say(text: string, lang: "ga" | "en" = "en") {
    stopSpeech();
    const clean = text.replace(/[«»*_]/g, "").trim();
    if (!clean) return;
    const key = `${lang}|${clean}`;
    let url = clips.get(key);
    if (!url) {
        const r = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean, lang }) }).catch(() => null);
        if (r && r.ok) {
            url = URL.createObjectURL(await r.blob());
            clips.set(key, url);
        }
    }
    if (url) {
        const a = new Audio(url);
        current = a;
        await a.play().catch(() => {});
        return;
    }
    if (typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(clean);
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.lang.startsWith(lang === "ga" ? "ga" : "en-IE")) ?? voices.find((v) => v.lang.startsWith("en-GB")) ?? null;
    speechSynthesis.speak(u);
}

/** Irish or English? A rough call from the letters: fadas or the common Irish function words. */
export const langOf = (text: string): "ga" | "en" => (/[áéíóúÁÉÍÓÚ]/.test(text) || /\b(an|agus|mé|tú|sé|sí|go|ar|le|ag|na|is|bhí|tá)\b/i.test(text) ? "ga" : "en");
