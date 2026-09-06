import * as v from 'valibot';

/** Longest classroom name accepted on the create-classroom form. */
export const CLASSROOM_NAME_MAX_LENGTH = 120;
/** GitHub organization logins are at most 39 characters long. */
export const ORG_LOGIN_MAX_LENGTH = 39;
/** Upper bound for a pasted or uploaded roster's content size, in characters. */
export const ROSTER_SOURCE_MAX_LENGTH = 100_000;
/** Longest single student name accepted inside a roster. */
export const ROSTER_NAME_MAX_LENGTH = 120;

export const ClassroomNameSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Classroom name is required.'),
    v.maxLength(
        CLASSROOM_NAME_MAX_LENGTH,
        `Classroom name must be at most ${CLASSROOM_NAME_MAX_LENGTH} characters long.`,
    ),
);

const ORG_LOGIN_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/u;

export const OrgLoginSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'GitHub organization is required.'),
    v.maxLength(
        ORG_LOGIN_MAX_LENGTH,
        `GitHub organization must be at most ${ORG_LOGIN_MAX_LENGTH} characters long.`,
    ),
    v.regex(ORG_LOGIN_REGEX, 'GitHub organization must be a valid organization login.'),
);

/** Accepts `null` (field absent on the form), effectively an empty roster */
const RosterSourceSchema = v.pipe(
    v.union([
        v.null(),
        v.pipe(
            v.string(),
            v.maxLength(
                ROSTER_SOURCE_MAX_LENGTH,
                `Roster content must be at most ${ROSTER_SOURCE_MAX_LENGTH} characters long.`,
            ),
        ),
    ]),
    v.transform((raw) => {
        const trimmed = raw === null ? '' : raw.trim();
        return trimmed === '' ? null : trimmed;
    }),
);

export const CsvRosterSchema = v.object({ format: v.literal('csv'), content: v.string() });
export const TextRosterSchema = v.object({ format: v.literal('text'), content: v.string() });

export const RosterSchema = v.union([CsvRosterSchema, TextRosterSchema]);
export type Roster = v.InferOutput<typeof RosterSchema>;

export const CreateClassroomInputSchema = v.pipe(
    v.object({
        name: ClassroomNameSchema,
        org: OrgLoginSchema,
        rosterCsv: RosterSourceSchema,
        rosterText: RosterSourceSchema,
    }),
    v.transform(({ rosterCsv, rosterText, ...rest }) => {
        // Use CSV upload when both roster sources are provided.
        if (rosterCsv !== null) {
            const roster: Roster = { format: 'csv', content: rosterCsv };
            return { ...rest, roster };
        }
        if (rosterText !== null) {
            const roster: Roster = { format: 'text', content: rosterText };
            return { ...rest, roster };
        }
        return { ...rest, roster: null };
    }),
);

export type CreateClassroomInput = v.InferOutput<typeof CreateClassroomInputSchema>;

export const StudentNameSchema = v.pipe(
    v.string(),
    v.minLength(1, 'Student name is required.'),
    v.maxLength(
        ROSTER_NAME_MAX_LENGTH,
        `Student name must be at most ${ROSTER_NAME_MAX_LENGTH} characters long.`,
    ),
);

/** Upper bound on parsed roster entries per classroom. */
export const ROSTER_MAX_STUDENTS = 500;

export const StudentRosterSchema = v.pipe(
    v.array(StudentNameSchema),
    v.maxLength(
        ROSTER_MAX_STUDENTS,
        `Roster must contain at most ${ROSTER_MAX_STUDENTS} students.`,
    ),
);
