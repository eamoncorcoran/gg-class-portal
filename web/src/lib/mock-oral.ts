// Mock orals (teacher side): the shapes /api/mock-oral/admin returns and the wording helpers the old
// app used (moClock, moDate, moTime, moPlural).

export type MoDay = {
    id: string;
    date: string; // YYYY-MM-DD
    number: number;
    label: string; // "Mock 1"
    examiners: number;
    bookingOpen: boolean;
    classIds: string[] | null;
    note: string;
    capacity: number;
    booked: number;
    free: number;
    percent: number;
    students: number;
    past: boolean;
    examinersNeeded?: number;
};
export type MoClass = { id: string; label: string; students: number };
export type MoOverview = { slotsPerExaminer: number; maxExaminers: number; days: MoDay[]; classes: MoClass[] };
export type MoSlot = { kind: "oral"; slot: number; start: string; end: string } | { kind: "break"; label: string; start: string; end: string; slot?: number };
export type MoExaminer = { number: number; name: string; link: string; booked: number };
export type MoBooking = { id: string; slot: number; examiner: number; startsAt: string; bookedAt: string; student: { id: string; name: string; email: string }; guest: boolean };
export type MoStudent = { id: string; name: string; email: string };
export type MoDayDetail = { day: MoDay; timetable: MoSlot[]; examiners: MoExaminer[]; bookings: MoBooking[]; students: MoStudent[] };

/** "9:00am" from "09:00". */
export const moClock = (clock: string) => {
    const [hour, minute] = String(clock).split(":").map(Number);
    return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
};

/* A calendar day, drawn at noon so no timezone can tip it into the day before. */
export const moDate = (date: string, short = false) =>
    new Date(`${date}T12:00:00`).toLocaleDateString("en-IE", short ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/,/g, "");

/* The same wording from a timestamp, always in Irish time: the orals happen in Ireland wherever the
   student's laptop thinks it is. */
export const moTime = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Dublin" }).format(new Date(value));
    return moClock(parts);
};

export const moPlural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "Mon 10 Nov 2026, 12:36" in Irish time, as the old fmtDate(value, { time: true }). */
export const moWhen = (value: string) =>
    new Intl.DateTimeFormat("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" }).format(new Date(value));
