// Exams and homework keep question ids; a page showing them must have those subjects' data loaded.
// Returns a counter that changes once the missing subjects are in, so the page renders again.
import { useEffect, useState } from "react";
import { D, ensureLoadedFor } from "./data";

export function useLoadedFor(ids: string[]) {
    const key = ids.join(",");
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (ids.every((id) => D().q[id])) return;
        let on = true;
        ensureLoadedFor(ids).then(() => on && setTick((t) => t + 1));
        return () => {
            on = false;
        };
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    return tick;
}
