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

export const DeadlineSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Deadline is required.'),
    v.check((s) => !Number.isNaN(new Date(s).getTime()), 'Please provide a valid deadline.'),
    v.transform((s) => new Date(s)),
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
