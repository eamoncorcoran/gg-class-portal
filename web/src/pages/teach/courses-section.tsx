// The teacher's Courses: the shelf of courses with their covers and a manage menu on each card, and
// (at /teach/courses/:id, with ?lesson=<id> for a particular lesson) one course open for editing.
// Ported from coursesView / courseCard / bindCourseAdmin in app.js. The student-facing player is
// src/pages/courses-pages.tsx; this is the editor.
import { useEffect, useState } from "react";
import { BookOpen01 } from "@/components/app/ic";
import { Link, useParams } from "react-router";
import { SectionHead } from "@/components/app/console";
import { DuoButton } from "@/components/app/duo";
import { Empty } from "@/components/app/page-parts";
import { toast } from "@/components/app/toast";
import { useApi } from "@/lib/portal";
import { type CourseRow, plural } from "@/lib/teach-courses";
import { CourseActions, CourseEditor, CourseModal, CoverArt } from "./course-editor";
import { ZoomImport } from "./zoom-import";

export const CoursesSection = () => {
    const { id } = useParams();
    return id ? <CourseEditor key={id} courseId={id} /> : <CourseGrid />;
};

const CourseGrid = () => {
    const { data, loading, error, reload } = useApi<{ courses: CourseRow[] }>("/api/admin/courses");
    const [creating, setCreating] = useState(false);
    const [zoom, setZoom] = useState(false);
    useEffect(() => {
        if (error) toast(error.message);
    }, [error]);
    const courses = data?.courses ?? [];

    return (
        <>
            <SectionHead
                kicker="Courses"
                title="Courses"
                sub="Class recordings and the notes that go with them."
                actions={
                    <>
                        <DuoButton size="sm" color="secondary" onPress={() => setZoom(true)}>
                            Import from Zoom
                        </DuoButton>
                        <DuoButton size="sm" onPress={() => setCreating(true)}>
                            New course
                        </DuoButton>
                    </>
                }
            />
            {loading && !data && <p className="text-sm text-quaternary">Loading…</p>}
            {data && courses.length === 0 && <Empty icon={BookOpen01} title="No courses yet" note="Create one, add a section for each term, then a lesson for each class recording." />}
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {courses.map((course) => (
                    <CourseCard key={course.id} course={course} reload={reload} />
                ))}
            </ul>
            <CourseModal open={creating} onClose={() => setCreating(false)} course={null} onSaved={reload} />
            <ZoomImport open={zoom} onClose={() => setZoom(false)} courses={courses} />
        </>
    );
};

const CourseCard = ({ course, reload }: { course: CourseRow; reload: () => Promise<void> }) => {
    const lessons = course.lesson_count || 0;
    return (
        <li className="relative">
            <Link to={`/teach/courses/${course.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border-2 border-secondary border-b-4 bg-primary outline-focus-ring transition duration-100 ease-linear hover:border-brand-300 focus-visible:outline-2 active:translate-y-0.5 active:border-b-2">
                <CoverArt course={course} className="aspect-[2/1]" />
                <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-lg font-bold text-primary">{course.title}</h2>
                    {course.description && <p className="mt-1 line-clamp-2 text-sm text-tertiary">{course.description}</p>}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs font-bold text-tertiary">
                        <span>{plural(lessons, "lesson")}</span>
                        {/* Who a course reaches is the thing most easily got wrong, so it is on the card rather than one click inside the settings. */}
                        <span className="text-brand-secondary">{course.open_to_all ? "Every class" : course.classes?.length ? `${course.classes.length} class${course.classes.length === 1 ? "" : "es"}` : "No class yet"}</span>
                    </div>
                </div>
            </Link>
            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start gap-2">
                {course.published === false && <span className="rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold tracking-wide text-warning-primary uppercase">Draft</span>}
                {course.on_demand && <span className="rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold tracking-wide text-brand-700 uppercase">On-Demand</span>}
                <span className="pointer-events-auto ml-auto">
                    <CourseActions course={course} afterChange={reload} afterDelete={reload} />
                </span>
            </div>
        </li>
    );
};
