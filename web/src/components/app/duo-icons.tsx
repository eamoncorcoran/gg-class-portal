// The app's big icons: Icons8's "Liquid Glass Color" set (https://icons8.com/icons/set/lightbulb--style-liquid-glass-color),
// served from /icons8/*.png at 256px. Each component takes the same props as an icon, so it drops
// into NavRow, FeaturedIcon, page headers and menus as before. The Irish flag stays a drawing.
import type { ImgHTMLAttributes, SVGProps } from "react";
import { cx } from "@/utils/cx";

type P = SVGProps<SVGSVGElement>;
type IP = ImgHTMLAttributes<HTMLImageElement>;
const Svg = ({ children, ...p }: P) => (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...p}>
        {children}
    </svg>
);
const C = { white: "#FFFFFF" };

/** One icon from the set, by its Icons8 name. Rounded like the tiles themselves so a tinted ring sits flush. */
const glass = (name: string, label: string) => {
    const Icon = ({ className, alt = "", ...p }: IP) => <img src={`/icons8/${name}.png`} alt={alt} width={256} height={256} draggable={false} aria-hidden={alt ? undefined : true} className={cx("inline-block size-6 shrink-0 rounded-[22%] select-none", className)} {...p} />;
    Icon.displayName = label;
    return Icon;
};

/** An envelope: private messages. Drawn here, in the set's rounded glassy manner, because the set has no letter. */
export const DuoMail = ({ className, ...p }: P) => (
    <Svg className={cx("inline-block size-6 shrink-0", className)} {...p}>
        <defs>
            <linearGradient id="duo-mail-body" x1="16" y1="6" x2="16" y2="27" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6CC7FF" />
                <stop offset="1" stopColor="#2F8BEA" />
            </linearGradient>
            <linearGradient id="duo-mail-flap" x1="16" y1="6" x2="16" y2="19" gradientUnits="userSpaceOnUse">
                <stop stopColor="#B9E6FF" />
                <stop offset="1" stopColor="#7FCBFF" />
            </linearGradient>
        </defs>
        <rect x="3" y="6.5" width="26" height="20" rx="5.5" fill="url(#duo-mail-body)" />
        <path d="M4.6 9.2C4.6 7.7 5.9 6.5 7.5 6.5h17c1.6 0 2.9 1.2 2.9 2.7 0 .9-.5 1.8-1.3 2.3l-8.4 5.4a3.1 3.1 0 0 1-3.4 0L5.9 11.5a2.7 2.7 0 0 1-1.3-2.3Z" fill="url(#duo-mail-flap)" />
        <path d="M6.2 9.6l8.6 5.6a2.2 2.2 0 0 0 2.4 0l8.6-5.6" stroke={C.white} strokeOpacity=".9" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

/** Loudspeaker: Aural, Fógra (announcement). */
export const DuoMegaphone = glass("loudspeaker", "DuoMegaphone");
/** Chat: Community, Comhrá. */
export const DuoBubbles = glass("chat", "DuoBubbles");
/** News: Píosa Nuachta. */
export const DuoNews = glass("news", "DuoNews");
/** Pencil: composition, writing. */
export const DuoPencil = glass("pencil", "DuoPencil");
/** A book: reading comprehension, prose. */
export const DuoBook = glass("book", "DuoBook");
/** Literature: poetry. */
export const DuoScroll = glass("literature", "DuoScroll");
/** Feather: the oral, Léamh na Filíochta. */
export const DuoFeather = glass("feather", "DuoFeather");
/** Help: past questions. */
export const DuoQuestion = glass("help", "DuoQuestion");
/** Idea: lessons, notes. */
export const DuoBulb = glass("idea", "DuoBulb");
/** Task: homework, the teacher console. */
export const DuoCheckDoc = glass("task", "DuoCheckDoc");
/** Documents: past papers. */
export const DuoFolder = glass("documents", "DuoFolder");
/** Clipboard: samples and guides, exams. */
export const DuoClipboard = glass("clipboard", "DuoClipboard");
/** Books: courses. */
export const DuoBooks = glass("books", "DuoBooks");
/** Headphones: listening. */
export const DuoHeadphones = glass("headphones", "DuoHeadphones");
/** Goal: targets, marks. */
export const DuoTarget = glass("goal", "DuoTarget");
/** Search. */
export const DuoSearch = glass("zoom-in", "DuoSearch");
/** Sparkle: something new. */
export const DuoSparkle = glass("sparkling", "DuoSparkle");
/** Home. */
export const DuoHome = glass("home", "DuoHome");
/** Video call: the live classroom. */
export const DuoLive = glass("video-call", "DuoLive");
/** Calendar. */
export const DuoCalendar = glass("calendar", "DuoCalendar");

/** The Irish flag, drawn. */
export const DuoFlagIE = (p: P) => (
    <Svg {...p}>
        <rect x="2" y="5" width="28" height="22" rx="5" fill={C.white} />
        <path d="M2 10a5 5 0 0 1 5-5h4.3v22H7a5 5 0 0 1-5-5V10Z" fill="#169B62" />
        <path d="M20.7 5H25a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5h-4.3V5Z" fill="#FF883E" />
        <path d="M2 22h28v-1H2v1Z" fill="#000" opacity=".06" />
    </Svg>
);
