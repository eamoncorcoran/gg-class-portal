// Two things a person can be in the middle of while browsing past questions: choosing questions to
// print, and collecting questions for an exam. Neither is saved; both last until they are finished
// or cancelled, and survive moving from one topic to the next so questions can be gathered across them.
import { useSyncExternalStore } from "react";

type State = {
    /** choosing what to print: every question shows a tick box instead of its buttons */
    printing: boolean;
    /** the questions ticked for printing, in the order they were ticked */
    ids: string[];
    /** print the marking scheme under each question */
    scheme: boolean;
    /** the questions on the page being looked at, for "Select all" */
    scope: string[];
    /** collecting for an exam: every question shows "Add to exam" */
    building: boolean;
};

let state: State = { printing: false, ids: [], scheme: false, scope: [], building: false };
const subs = new Set<() => void>();
const put = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    subs.forEach((f) => f());
};

export const usePick = <T,>(pick: (s: State) => T): T => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => pick(state));
export const getPick = () => state;

/** Start choosing what to print, with one question already ticked when it was that question's print button. */
export const startPrinting = (id?: string) => put({ printing: true, ids: id && !state.ids.includes(id) ? [...state.ids, id] : state.ids });
export const stopPrinting = () => put({ printing: false, ids: [], scheme: false });
export const togglePick = (id: string) => put({ ids: state.ids.includes(id) ? state.ids.filter((x) => x !== id) : [...state.ids, id] });
export const pickAll = (ids: string[]) => put({ ids: [...state.ids, ...ids.filter((id) => !state.ids.includes(id))] });
export const setScheme = (scheme: boolean) => put({ scheme });
export const setScope = (scope: string[]) => put({ scope });
export const setBuilding = (building: boolean) => put({ building });
