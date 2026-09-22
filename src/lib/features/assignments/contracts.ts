import * as v from 'valibot';

export const ASSIGNMENT_NAME_MAX_LENGTH = 120;
export const TEMPLATE_REPO_MAX_LENGTH = 100;

export const AssignmentNameSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Assignment name is required.'),
    v.maxLength(
        ASSIGNMENT_NAME_MAX_LENGTH,
        `Assignment name must be at most ${ASSIGNMENT_NAME_MAX_LENGTH} characters long.`,
    ),
);

/** Parses a `datetime-local` wall clock as UTC. */
function utcDeadline(value: string) {
    return new Date(`${value.replace(' ', 'T')}:00Z`);
}

export const DeadlineSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Deadline is required.'),
    v.isoDateTime('Please provide a valid deadline.'),
    // `Date` rolls impossible calendar dates (e.g. Feb 30) into the next month; the round-trip comparison rejects them.
    v.check((s) => {
        const date = utcDeadline(s);
        return (
            date.getUTCFullYear() === Number(s.slice(0, 4)) &&
            date.getUTCMonth() === Number(s.slice(5, 7)) - 1 &&
            date.getUTCDate() === Number(s.slice(8, 10)) &&
            date.getUTCHours() === Number(s.slice(11, 13)) &&
            date.getUTCMinutes() === Number(s.slice(14, 16))
        );
    }, 'Please provide a valid deadline.'),
    v.transform(utcDeadline),
);

export const TemplateRepoSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Repository template is required.'),
    v.maxLength(TEMPLATE_REPO_MAX_LENGTH, 'Repository name must be at most 100 characters long.'),
);

export const CreateAssignmentInputSchema = v.object({
    name: AssignmentNameSchema,
    deadline: DeadlineSchema,
    templateRepo: TemplateRepoSchema,
});

export type CreateAssignmentInput = v.InferOutput<typeof CreateAssignmentInputSchema>;
