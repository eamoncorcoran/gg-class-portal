// Attachments for a board post: documents go to the hub with a progress bar, videos go to Bunny
// straight from the browser over TUS. Ported from the old app.js (fileSize, attachmentFormat,
// uploadDocument, tusSend, tusUpload, acceptVideos, acceptDocuments), same limits and messages.
import { api } from "@/lib/portal";

export const MAX_ATTACHMENT_MB = 40;

export type AttachmentKind = "gif" | "youtube" | "loom" | "file" | "bunny";
/** One row in the composer's attachment list: an existing one (by id) or one going up / arrived / failed. */
export type DraftAttachment = {
    key: string;
    id?: string;
    existing?: boolean;
    kind: AttachmentKind;
    url?: string;
    storedName?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    preview?: string;
    /** 0..100 while uploading; undefined once done or failed */
    progress?: number;
    error?: string;
};

let keyN = 0;
export const draftKey = () => `d${++keyN}-${Date.now()}`;

/** "2.4 MB", the way a file manager writes it. */
export const fileSize = (bytes?: number) => {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export const attachmentFormat = (item: { kind: string; fileName?: string; mimeType?: string }) => {
    if (item.kind === "gif") return "GIF";
    if (item.kind === "bunny") return "VIDEO";
    if (item.kind === "loom") return "LOOM";
    if (item.kind === "youtube") return "VIDEO";
    return /\.docx$/i.test(item.fileName || "") || String(item.mimeType || "").includes("wordprocessingml") ? "DOCX" : "PDF";
};

type Uploaded = { kind: "file"; url: string; storedName: string; fileName: string; mimeType: string; sizeBytes: number; label: string };

/* XHR rather than fetch, because fetch cannot report upload progress and a 40MB scan over a slow
   connection with no feedback looks like a hung page. */
export const uploadDocument = (file: File, onProgress: (pct: number) => void) =>
    new Promise<Uploaded>((resolve, reject) => {
        const form = new FormData();
        form.append("file", file);
        const request = new XMLHttpRequest();
        request.open("POST", "/api/admin/community/attachments");
        request.withCredentials = true;
        request.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        });
        request.addEventListener("load", () => {
            let payload: Partial<Uploaded> & { error?: string } = {};
            try {
                payload = JSON.parse(request.responseText);
            } catch {
                /* handled below */
            }
            if (request.status >= 200 && request.status < 300) resolve(payload as Uploaded);
            else reject(new Error(payload.error || "That file could not be uploaded."));
        });
        request.addEventListener("error", () => reject(new Error("That file could not be uploaded.")));
        request.send(form);
    });

/* A video for a post goes to Bunny straight from here. The portal reserves the video and signs this
   one upload; the file itself never passes through the portal's server. TUS is the resumable protocol
   Bunny takes: one request to open the upload, then the file in pieces. A piece that fails is retried
   from wherever Bunny says it got to. */
const TUS_PIECE = 16 * 1024 * 1024;
export type Ticket = { endpoint: string; libraryId: number | string; videoId: string; expires: number; signature: string };

const tusSend = (location: string, auth: Record<string, string>, offset: number, piece: Blob, onSent: (loaded: number) => void) =>
    new Promise<number>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PATCH", location);
        for (const [name, value] of Object.entries(auth)) request.setRequestHeader(name, value);
        request.setRequestHeader("Upload-Offset", String(offset));
        request.setRequestHeader("Content-Type", "application/offset+octet-stream");
        request.upload.addEventListener("progress", (event) => onSent(event.loaded));
        request.addEventListener("load", () => {
            if (request.status >= 200 && request.status < 300) return resolve(Number(request.getResponseHeader("Upload-Offset")) || offset + piece.size);
            reject(new Error(`The video upload stopped (${request.status}).`));
        });
        request.addEventListener("error", () => reject(new Error("The connection dropped during the video upload.")));
        request.send(piece);
    });

export const tusUpload = async (file: File, ticket: Ticket, onProgress: (pct: number) => void) => {
    const auth: Record<string, string> = {
        AuthorizationSignature: ticket.signature,
        AuthorizationExpire: String(ticket.expires),
        VideoId: ticket.videoId,
        LibraryId: String(ticket.libraryId),
        "Tus-Resumable": "1.0.0",
    };
    const b64 = (value: string) => btoa(unescape(encodeURIComponent(value)));
    const opened = await fetch(ticket.endpoint, {
        method: "POST",
        headers: { ...auth, "Upload-Length": String(file.size), "Upload-Metadata": `filetype ${b64(file.type || "video/mp4")},title ${b64(file.name)}` },
    });
    const loc = opened.headers.get("Location");
    if (!opened.ok || !loc) throw new Error(`Bunny would not take the video (${opened.status}).`);
    const location = new URL(loc, ticket.endpoint).href;
    let offset = 0;
    while (offset < file.size) {
        const piece = file.slice(offset, offset + TUS_PIECE);
        const from = offset;
        for (let attempt = 0; ; attempt += 1) {
            try {
                offset = await tusSend(location, auth, from, piece, (sent) => onProgress(Math.min(99, Math.floor(((from + sent) / file.size) * 100))));
                break;
            } catch (error) {
                if (attempt >= 4) throw error;
                await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
                // Where Bunny got to, so a piece that half arrived is not sent twice.
                const head = await fetch(location, { method: "HEAD", headers: auth }).catch(() => null);
                const at = Number(head?.headers.get("Upload-Offset"));
                if (head?.ok && Number.isFinite(at) && at !== from) {
                    offset = at;
                    break;
                }
            }
        }
    }
    onProgress(100);
};

/** Updates one row in the list by key. */
type Patch = (key: string, change: Partial<DraftAttachment>) => void;
type Add = (row: DraftAttachment) => void;

export const acceptVideos = async (files: FileList | File[], add: Add, patch: Patch) => {
    for (const file of [...files]) {
        const key = draftKey();
        if (!String(file.type || "").startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)) {
            add({ key, kind: "bunny", fileName: file.name, sizeBytes: file.size, error: "That is not a video file." });
            continue;
        }
        add({ key, kind: "bunny", fileName: file.name, sizeBytes: file.size, mimeType: file.type || "video/mp4", progress: 0 });
        try {
            const ticket = await api<Ticket>("/api/admin/community/videos", { method: "POST", json: { fileName: file.name, sizeBytes: file.size } });
            await tusUpload(file, ticket, (percent) => patch(key, { progress: percent }));
            patch(key, { url: `bunny:${ticket.videoId}`, storedName: ticket.videoId, progress: 100 });
        } catch (error) {
            patch(key, { error: (error as Error).message, progress: undefined });
        }
    }
};

/* Checked here as well as on the server so somebody does not watch a 60MB file upload for a minute
   only to be told at the end. */
export const acceptDocuments = async (files: FileList | File[], add: Add, patch: Patch) => {
    for (const file of [...files]) {
        const key = draftKey();
        if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
            add({ key, kind: "file", fileName: file.name, sizeBytes: file.size, error: `Too large. The limit is ${MAX_ATTACHMENT_MB}MB.` });
            continue;
        }
        add({ key, kind: "file", fileName: file.name, sizeBytes: file.size, progress: 0 });
        try {
            const uploaded = await uploadDocument(file, (percent) => patch(key, { progress: percent }));
            patch(key, { ...uploaded, progress: 100 });
        } catch (error) {
            patch(key, { error: (error as Error).message, progress: undefined });
        }
    }
};

/** What the server takes: kept rows by id, new ones in full. Failed or still-uploading rows are left out. */
export const attachmentsForSave = (list: DraftAttachment[]) =>
    list
        .filter((item) => (item.existing ? item.id : item.url) && !item.error)
        .map(({ id, existing, kind, url, storedName, fileName, mimeType, sizeBytes }) => (existing ? { id } : kind === "file" || kind === "bunny" ? { kind, url, storedName, fileName, mimeType, sizeBytes } : { kind, url }));

export const uploadsInFlight = (list: DraftAttachment[]) => list.some((item) => item.progress != null && item.progress < 100 && !item.error);

/* ---- audio recording, as the old startRecording: one at a time, track always stopped ---- */
export const voiceSupported = () => Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
const preferredAudioType = () => {
    if (typeof MediaRecorder === "undefined") return "";
    return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
};
export const fmtDuration = (seconds?: number) => {
    const total = Math.max(0, Math.round(seconds || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
export const audioFileName = (blob: Blob) => {
    const base = String(blob.type).split(";")[0];
    return `recording${({ "audio/webm": ".webm", "audio/mp4": ".mp4", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/wav": ".wav" } as Record<string, string>)[base] || ".webm"}`;
};

export type Recording = { readonly seconds: number; cancel: () => void; stop: () => Promise<{ blob: Blob; seconds: number }> };
let activeRecorder: Recording | null = null;

export const startRecording = async ({ onTick }: { onTick?: (seconds: number) => void } = {}): Promise<Recording> => {
    if (!voiceSupported()) throw new Error("This browser cannot record audio. Try Chrome, Edge or Safari.");
    if (activeRecorder) await activeRecorder.stop().catch(() => undefined);
    let stream: MediaStream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
        const name = (error as DOMException).name;
        if (name === "NotAllowedError" || name === "SecurityError") throw new Error("Microphone access was blocked. Allow it for this site in your browser settings, then try again.");
        if (name === "NotFoundError") throw new Error("No microphone was found.");
        throw new Error("The microphone could not be started.");
    }
    const mimeType = preferredAudioType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) chunks.push(event.data);
    });
    const tickTimer = onTick ? setInterval(() => onTick((Date.now() - startedAt) / 1000), 250) : null;
    const cleanUp = () => {
        if (tickTimer) clearInterval(tickTimer);
        stream.getTracks().forEach((track) => track.stop());
        if (activeRecorder === handle) activeRecorder = null;
    };
    recorder.start();
    const handle: Recording = {
        get seconds() {
            return (Date.now() - startedAt) / 1000;
        },
        cancel() {
            try {
                recorder.stop();
            } catch {
                /* already stopped */
            }
            cleanUp();
        },
        stop() {
            return new Promise((resolve, reject) => {
                recorder.addEventListener("error", (event) => {
                    cleanUp();
                    reject((event as ErrorEvent).error || new Error("Recording failed."));
                }, { once: true });
                recorder.addEventListener("stop", () => {
                    const seconds = (Date.now() - startedAt) / 1000;
                    cleanUp();
                    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
                    if (!blob.size) return reject(new Error("Nothing was recorded."));
                    resolve({ blob, seconds });
                }, { once: true });
                try {
                    recorder.stop();
                } catch (error) {
                    cleanUp();
                    reject(error);
                }
            });
        },
    };
    activeRecorder = handle;
    return handle;
};
