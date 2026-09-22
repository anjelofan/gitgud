import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
    ASSIGNMENT_NAME_MAX_LENGTH,
    CreateAssignmentInputSchema,
    DeadlineSchema,
    TEMPLATE_REPO_MAX_LENGTH,
} from './contracts.ts';

describe('CreateAssignmentInputSchema', () => {
    it('accepts a valid assignment', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.deadline).toBeInstanceOf(Date);
    });

    it('trims the assignment name value', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: '   DTP Assignment #0  ',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.name).toBe('DTP Assignment #0');
    });

    it('trims the deadline value', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: '   DTP Assignment #0  ',
            deadline: '    2026-09-15T18:00   ',
            templateRepo: 'dtp2627a-0',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.deadline).toBeInstanceOf(Date);
    });

    it('trims the templateRepo value', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: '   dtp2627a-00   ',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.templateRepo).toBe('dtp2627a-00');
    });

    it('rejects an empty trimmed assignment name', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: '    ',
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
        });
        expect(result.success).toBe(false);
    });

    it('rejects an empty trimmed templateRepo', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: '    ',
        });
        expect(result.success).toBe(false);
    });

    it('rejects an empty trimmed deadline', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '    ',
            templateRepo: 'dtp2627a-0',
        });
        expect(result.success).toBe(false);
    });

    it('rejects an unparsable deadline', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: 'no deadline :D',
            templateRepo: 'dtp2627a-0',
        });
        expect(result.success).toBe(false);
    });

    it('accepts an assignment name exactly the length cap', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'l'.repeat(ASSIGNMENT_NAME_MAX_LENGTH),
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
        });
        expect(result.success).toBe(true);
    });

    it('accepts a template repo exactly the length cap', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'r'.repeat(TEMPLATE_REPO_MAX_LENGTH),
        });
        expect(result.success).toBe(true);
    });

    it('rejects an assignment name over the length cap', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'l'.repeat(ASSIGNMENT_NAME_MAX_LENGTH + 1),
            deadline: '2026-09-15T18:00',
            templateRepo: 'dtp2627a-0',
        });
        expect(result.success).toBe(false);
    });

    it('rejects a template repo over the length cap', () => {
        const result = v.safeParse(CreateAssignmentInputSchema, {
            name: 'DTP Assignment #0',
            deadline: '2026-09-15T18:00',
            templateRepo: 'r'.repeat(TEMPLATE_REPO_MAX_LENGTH + 1),
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
