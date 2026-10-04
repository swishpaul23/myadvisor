import { z } from "zod";
import { DESIGNATIONS } from "./schema";

// Zod schemas for the course data that `npm run data:build` writes to data/generated/:
// courses.json, offerings.json, unknown-courses.json. Built from data/raw/outlines/.

const courseCode = z.string().regex(/^[A-Z]{2,5} \d{3}[A-Z]?$/);
/** Term keys look like "2026-fall". */
export const termKeySchema = z.string().regex(/^\d{4}-(spring|summer|fall)$/);
const text = z.string().nullable();

export const courseSchema = z.object({
  code: courseCode,
  title: text,
  /** null when the outline has no units field. */
  units: z.number().nonnegative().nullable(),
  /** Hundreds of the course number: BUS 217W -> 200. */
  level: z.number().int().min(0).max(900),
  department: z.string().regex(/^[A-Z]{2,5}$/),
  prerequisites_text: text,
  corequisites_text: text,
  description: text,
  designations: z.array(z.enum(DESIGNATIONS)),
  /** info.designation exactly as SFU returned it; null if absent. */
  designation_raw: text,
  /** Term the outline came from. */
  source_term: termKeySchema,
});
export const coursesFileSchema = z.array(courseSchema);
export type Course = z.output<typeof courseSchema>;

/** Section types for one term, e.g. ["LEC", "TUT"]. A term appears only if it had a section. */
const sectionTypes = z.array(z.string().min(1)).min(1);

/** Per course: confirmed terms as keys, plus `future` for scheduled-but-not-yet-run terms. */
export const courseOfferingsSchema = z
  .object({ future: z.record(termKeySchema, sectionTypes) })
  .catchall(sectionTypes)
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (key !== "future" && !termKeySchema.safeParse(key).success) {
        ctx.addIssue({
          code: "custom",
          message: `"${key}" is not a term key like "2026-fall"`,
        });
      }
    }
  });
export const offeringsFileSchema = z.record(courseCode, courseOfferingsSchema);
export type CourseOfferings = z.output<typeof courseOfferingsSchema>;

export const unknownCourseSchema = z.object({
  code: courseCode,
  /** requirements.csv rows that name this course. */
  req_ids: z.array(z.string()).min(1),
  reason: z.string(),
});
export const unknownCoursesFileSchema = z.array(unknownCourseSchema);
export type UnknownCourse = z.output<typeof unknownCourseSchema>;
