import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
    CreateProgramInputSchema,
    ROSTER_MAX_STUDENTS,
    ROSTER_NAME_MAX_LENGTH,
    ROSTER_SOURCE_MAX_LENGTH,
    StudentNameSchema,
    StudentRosterSchema,
} from './contracts.ts';

describe('CreateProgramInputSchema', () => {
    it('selects the CSV roster when both roster sources are provided', () => {
        const result = v.safeParse(CreateProgramInputSchema, {
            name: 'Algorithms',
            org: 'acme-edu',
            rosterCsv: 'Ada Lovelace\n',
            rosterText: 'Ignored Student\n',
        });
        expect(result.success).toBe(true);
        if (result.success)
            expect(result.output.roster).toEqual({ format: 'csv', content: 'Ada Lovelace' });
    });

    it('uses the text roster when no CSV is provided', () => {
        const result = v.safeParse(CreateProgramInputSchema, {
            name: 'Algorithms',
            org: 'acme-edu',
            rosterCsv: null,
            rosterText: 'Ada Lovelace\nGrace Hopper',
        });
        expect(result.success).toBe(true);
        if (result.success)
            expect(result.output.roster).toEqual({
                format: 'text',
                content: 'Ada Lovelace\nGrace Hopper',
            });
    });

    it('yields no roster when both sources are blank', () => {
        const result = v.safeParse(CreateProgramInputSchema, {
            name: 'Algorithms',
            org: 'acme-edu',
            rosterCsv: null,
            rosterText: '   ',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.roster).toBeNull();
    });

    it('trims the program name and org into domain values', () => {
        const result = v.safeParse(CreateProgramInputSchema, {
            name: '  Algorithms  ',
            org: ' acme-edu ',
            rosterCsv: null,
            rosterText: null,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.output.name).toBe('Algorithms');
            expect(result.output.org).toBe('acme-edu');
        }
    });

    it('rejects an org that is not a valid GitHub login', () => {
        const result = v.safeParse(CreateProgramInputSchema, {
            name: 'Algorithms',
            org: 'not an org!',
            rosterCsv: null,
            rosterText: null,
        });
        expect(result.success).toBe(false);
    });

    it('rejects org logins with consecutive or edge hyphens', () => {
        for (const org of ['acme--edu', '-acme', 'acme-']) {
            const result = v.safeParse(CreateProgramInputSchema, {
                name: 'Algorithms',
                org,
                rosterCsv: null,
                rosterText: null,
            });
            expect(result.success).toBe(false);
        }
    });

    it('rejects roster content over the size cap', () => {
        const result = v.safeParse(CreateProgramInputSchema, {
            name: 'Algorithms',
            org: 'acme-edu',
            rosterCsv: 'x'.repeat(ROSTER_SOURCE_MAX_LENGTH + 1),
            rosterText: null,
        });
        expect(result.success).toBe(false);
    });
});

describe('StudentNameSchema', () => {
    it('trims the student name into a domain value', () => {
        const result = v.safeParse(StudentNameSchema, '  Ada Lovelace  ');
        expect(result.success).toBe(true);
        if (result.success) expect(result.output).toBe('Ada Lovelace');
    });
});

describe('StudentRosterSchema', () => {
    it('accepts a roster exactly at the student cap', () => {
        const students = Array.from(
            { length: ROSTER_MAX_STUDENTS },
            (_, index) => `Student ${index}`,
        );
        expect(v.safeParse(StudentRosterSchema, students).success).toBe(true);
    });

    it('rejects a roster over the student cap', () => {
        const students = Array.from(
            { length: ROSTER_MAX_STUDENTS + 1 },
            (_, index) => `Student ${index}`,
        );
        expect(v.safeParse(StudentRosterSchema, students).success).toBe(false);
    });

    it('rejects a student name over the length cap', () => {
        const students = ['x'.repeat(ROSTER_NAME_MAX_LENGTH + 1)];
        expect(v.safeParse(StudentRosterSchema, students).success).toBe(false);
    });
});
