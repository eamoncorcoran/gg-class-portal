// Types and small helpers shared by the ported student screens: the account page, the password
// pages, the mock oral booking and the Sraith Pictiúr. The payload shapes follow the route handlers
// in ~/gg-homework-portal/src/routes (auth.js, student.js, mockoral.js, sraith.js).
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { isAvatarRequired, refreshMe } from "@/lib/portal";

/* ---- the plain bordered text box every real <form> here uses (password managers want real inputs) */
export const INPUT = "w-full rounded-2xl border-2 border-secondary bg-primary px-4 py-3 text-md font-medium text-primary outline-hidden transition duration-100 ease-linear placeholder:text-placeholder/80 focus:border-brand";
export const TEXTAREA = `${INPUT} min-h-24 resize-y`;

/** Where a signed-out visitor goes to sign in and come back. */
export const signInHref = (path: string) => `/signin?next=${encodeURIComponent(path)}`;

/** The photograph step on the account page, coming back to `path` once it is done. */
export const avatarHref = (path: string) => `/account?avatar=1&next=${encodeURIComponent(path)}`;

/* The server refuses every student route with a 428 until a student has added a photograph. Wherever
   that is hit the answer is the same (as the old api() did): take them to the step that clears it
   rather than showing whichever screen half-loaded. */
export const useAvatarGate = (error: unknown) => {
    const nav = useNavigate();
    const { pathname, search } = useLocation();
    useEffect(() => {
        if (!isAvatarRequired(error)) return;
        refreshMe();
        nav(avatarHref(pathname + search), { replace: true });
    }, [error, nav, pathname, search]);
};

/* ---- passwords ------------------------------------------------------------------------------ */

/** The five rules the server's passwordProblems() checks, in the order the old app listed them. */
export const PASSWORD_RULES = [
    { id: "length", label: "12+ characters" },
    { id: "lower", label: "Lowercase" },
    { id: "upper", label: "Uppercase" },
    { id: "number", label: "Number" },
    { id: "symbol", label: "Symbol" },
] as const;
export type PasswordRuleId = (typeof PASSWORD_RULES)[number]["id"];

export const passwordChecks = (value: string, minimumLength = 12): Record<PasswordRuleId, boolean> => ({
    length: value.length >= minimumLength,
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    number: /[0-9]/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
});

export type PasswordPolicy = { minimumLength: number; requirements: string[]; exampleLength: number };

/* ---- photograph ----------------------------------------------------------------------------- */

export const AVATAR_MAX_BYTES = 6 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
export const AVATAR_TOO_BIG = "That photograph is over 6MB. Try a smaller one.";
/** The photo URL with a cache-buster, so a new picture is not hidden behind the cached old one. */
export const avatarUrl = (userId: string, stamp: number) => `/api/media/avatar/${userId}?t=${stamp}`;

/* ---- notifications, calendar feed, address, withdrawal -------------------------------------- */

export type Notifications = { boardPosts: boolean; boardReplies: boolean };
export type CalendarFeed = { url: string; token: string };
/** webcal: in place of http(s): so the calendar app subscribes rather than downloads. */
export const webcalUrl = (url: string) => url.replace(/^https?:/, "webcal:");

export type Address = {
    address_line1: string;
    address_line2: string;
    address_county: string;
    eircode: string;
    address_updated_at: string | null;
    counties?: string[];
    complete?: boolean;
};

/* The counties, so the list is the same one the server will accept. The server sends its own list
   with GET /api/student/address; this is the fallback when that request fails. */
export const COUNTIES = ["Antrim", "Armagh", "Carlow", "Cavan", "Clare", "Cork", "Derry", "Donegal",
    "Down", "Dublin", "Fermanagh", "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim",
    "Limerick", "Longford", "Louth", "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo",
    "Tipperary", "Tyrone", "Waterford", "Westmeath", "Wexford", "Wicklow"];

export const WITHDRAWAL_REASONS = [
    "Not enough time alongside work or family",
    "The course was not what I expected",
    "It moved too fast for me",
    "It moved too slowly for me",
    "Cost",
    "Health or personal reasons",
    "I got what I needed and I am finished",
    "Something else",
];

export type WithdrawalState = { withdrawnAt: string | null; response: Record<string, unknown> | null };
export type WithdrawalBody = {
    reason: string;
    detail: string;
    overallRating?: number;
    teachingRating?: number;
    materialsRating?: number;
    pace: string;
    whatWorked: string;
    whatToImprove: string;
    wouldRecommend: string;
    mayContact: boolean;
};

/* ---- mock orals ----------------------------------------------------------------------------- */

export type MoSlot = { slot: number; start: string; end: string; full: boolean; past: boolean };
export type MoDay = { id: string; date: string; number: number; label: string; slots: MoSlot[]; full: boolean };
export type MoBooking = {
    id: string;
    dayId: string;
    date: string;
    number: number;
    label: string;
    slot: number;
    start: string;
    end: string;
    startsAt: string;
    minutes: number;
    examiner: number;
    examinerName: string;
    link: string;
    note: string;
    manageUrl: string;
    canCancel: boolean;
};
export type MockOralView = { bookings: MoBooking[]; days: MoDay[]; emailed?: boolean };

/** "10:20" as "10:20am". The times are the day's own, in Irish time, wherever the page is read. */
export const moClock = (clock: string) => {
    const [hour, minute] = String(clock).split(":").map(Number);
    return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
};

/** A calendar day, drawn at noon so no timezone can tip it into the day before. */
export const moDate = (date: string, short = false) =>
    new Date(`${date}T12:00:00`)
        .toLocaleDateString("en-IE", short ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "long", day: "numeric", month: "long", year: "numeric" })
        .replace(/,/g, "");

/** The long date without the year, for the heading over the times. */
export const moDateNoYear = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" }).replace(/,/g, "");

/** The same wording from a timestamp, always in Irish time: the orals happen in Ireland wherever
    the student's laptop thinks it is. */
export const moTime = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Dublin" }).format(new Date(value));
    return moClock(parts);
};

export const moPlural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/* ---- Sraith Pictiúr ------------------------------------------------------------------------- */

export type SrImage = { src: string; width: number; height: number };
export type SrLine = { ga: string; en: string; audio: string };
export type SrSummary = { n: number; slug: string; title: string; boxes: number; sentences: number; cover: SrImage | null; pictures: number };
export type SrBox = { n: number; image: SrImage | null; sentences: SrLine[] };
export type SrStory = { n: number; slug: string; title: string; boxes: SrBox[]; ending: SrLine[]; prev: SrSummary | null; next: SrSummary | null; total: number };
export type SrPrefs = { english: boolean; slow: boolean };

const SRAITH_PREFS = "gg_sraith_prefs";
/** Hide-the-English and slow-speech, remembered on the device. */
export const sraithPrefs = (): SrPrefs => {
    try {
        return { english: true, slow: false, ...JSON.parse(localStorage.getItem(SRAITH_PREFS) || "{}") };
    } catch {
        return { english: true, slow: false };
    }
};
export const saveSraithPrefs = (prefs: SrPrefs) => {
    try {
        localStorage.setItem(SRAITH_PREFS, JSON.stringify(prefs));
    } catch {
        /* private window */
    }
};
export const srTwo = (n: number) => String(n).padStart(2, "0");
