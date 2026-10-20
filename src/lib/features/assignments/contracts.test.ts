import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
    ASSIGNMENT_NAME_MAX_LENGTH,
    CreateAssignmentInputSchema,
    DeadlineSchema,
    INVITE_TOKEN_MAX_LENGTH,
    InviteTokenSchema,
    ROSTER_ENTRY_NAME_MAX_LENGTH,
    RosterEntryNameSchema,
    TEMPLATE_REPO_MAX_LENGTH,
} from './contracts.ts';

describe('CreateAssignmentInputSchema', () => {
    it('accepts a valid assignment', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.output.deadline).toBeInstanceOf(Date);
            expect(result.output.maxScore).toBeUndefined();
        }
    });

    it('trims the assignment name value', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: '   DTP Assignment #0  ',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.name).toBe('DTP Assignment #0');
    });

    it('trims the deadline value', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: '   DTP Assignment #0  ',
            deadline: '    2026-09-15T18:00   ',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.deadline).toBeInstanceOf(Date);
    });

    it('trims the templateRepo value', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: '   dtp2627a-00   ',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.templateRepo).toBe('dtp2627a-00');
    });

    it('rejects an empty trimmed assignment name', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: '    ',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(false);
    });

    it('rejects an empty trimmed templateRepo', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: '    ',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(false);
    });

    it('rejects an empty trimmed deadline', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '    ',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(false);
    });

    it('rejects an unparsable deadline', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: 'no deadline :D',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(false);
    });

    it('accepts an assignment name exactly the length cap', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'l'.repeat(ASSIGNMENT_NAME_MAX_LENGTH),
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(true);
    });

    it('accepts a template repo exactly the length cap', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'r'.repeat(TEMPLATE_REPO_MAX_LENGTH),
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(true);
    });

    it('rejects an assignment name over the length cap', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'l'.repeat(ASSIGNMENT_NAME_MAX_LENGTH + 1),
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(false);
    });

    it('rejects a template repo over the length cap', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'r'.repeat(TEMPLATE_REPO_MAX_LENGTH + 1),
            gradingMode: 'autograding',
        });
        expect(result.success).toBe(false);
    });

    it('rejects an unknown grading mode', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'vibes',
        });
        expect(result.success).toBe(false);
    });

    it('accepts manual grading with a maximum score', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'manual',
            maxScore: ' 12.5 ',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.maxScore).toBe(12.5);
    });

    it('keeps an autograded assignment free of a maximum score', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'autograding',
            maxScore: '10',
        });
        expect(result.success).toBe(false);
    });

    it('requires a maximum score for manual grading', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'manual',
            maxScore: '   ',
        });
        expect(result.success).toBe(false);
    });

    it('rejects a maximum score with more than two decimal places', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'manual',
            maxScore: '10.123',
        });
        expect(result.success).toBe(false);
    });

    it('rejects a zero maximum score', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
            gradingMode: 'manual',
            maxScore: '0',
        });
        expect(result.success).toBe(false);
    });
});

describe('DeadlineSchema', () => {
    it('interprets the entered wall clock as UTC', () => {
        const result = v.safeParse(DeadlineSchema, '2026-09-15T18:00');
        expect(result.success).toBe(true);
        if (result.success)
            expect(result.output.getTime()).toBe(Date.parse('2026-09-15T18:00:00Z'));
    });

    it('normalizes a space-separated deadline the same way', () => {
        const result = v.safeParse(DeadlineSchema, '2026-09-15 18:00');
        expect(result.success).toBe(true);
        if (result.success)
            expect(result.output.getTime()).toBe(Date.parse('2026-09-15T18:00:00Z'));
    });

    it('rejects a bare number like "9"', () => {
        const result = v.safeParse(DeadlineSchema, '9');
        expect(result.success).toBe(false);
    });

    it('rejects a bare month name like "Dec"', () => {
        const result = v.safeParse(DeadlineSchema, 'Dec');
        expect(result.success).toBe(false);
    });

    it('rejects a seconds-suffixed datetime', () => {
        const result = v.safeParse(DeadlineSchema, '2026-09-15T18:00:30');
        expect(result.success).toBe(false);
    });

    it('rejects an impossible calendar date', () => {
        const result = v.safeParse(DeadlineSchema, '2026-02-30T18:00');
        expect(result.success).toBe(false);
    });
});

describe('InviteTokenSchema', () => {
    it('accepts a base64url token', () => {
        const result = v.safeParse(InviteTokenSchema, 'abcDEF0123_-');
        expect(result.success).toBe(true);
        if (result.success) expect(result.output).toBe('abcDEF0123_-');
    });

    it('rejects an empty token', () => {
        expect(v.safeParse(InviteTokenSchema, '').success).toBe(false);
    });

    it('rejects a token over the length cap', () => {
        expect(
            v.safeParse(InviteTokenSchema, 'a'.repeat(INVITE_TOKEN_MAX_LENGTH + 1)).success,
        ).toBe(false);
    });

    it('rejects a token with non-base64url characters', () => {
        expect(v.safeParse(InviteTokenSchema, 'not a token').success).toBe(false);
    });
});

describe('RosterEntryNameSchema', () => {
    it('trims a valid roster name', () => {
        const result = v.safeParse(RosterEntryNameSchema, '  Jane Doe  ');
        expect(result.success).toBe(true);
        if (result.success) expect(result.output).toBe('Jane Doe');
    });

    it('rejects a blank roster name', () => {
        expect(v.safeParse(RosterEntryNameSchema, '   ').success).toBe(false);
    });

    it('rejects a roster name over the length cap', () => {
        expect(
            v.safeParse(RosterEntryNameSchema, 'n'.repeat(ROSTER_ENTRY_NAME_MAX_LENGTH + 1))
                .success,
        ).toBe(false);
    });
});
