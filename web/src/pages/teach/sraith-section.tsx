// Sraith Pictiúr in the teacher console: the same page the students see, rooted at /teach/sraith so a
// picked sequence (/teach/sraith/:id) stays inside the console.
import { SraithPage } from "@/pages/student/sraith-page";

export const SraithSection = () => <SraithPage basePath="/teach/sraith" />;
