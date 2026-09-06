import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { CreateClassroomInputSchema, ROSTER_SOURCE_MAX_LENGTH } from './contracts.ts';

describe('CreateClassroomInputSchema', () => {
    it('selects the CSV roster when both roster sources are provided', () => {
        const result = v.safeParse(CreateClassroomInputSchema, {
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
        const result = v.safeParse(CreateClassroomInputSchema, {
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
        const result = v.safeParse(CreateClassroomInputSchema, {
            name: 'Algorithms',
            org: 'acme-edu',
            rosterCsv: null,
            rosterText: '   ',
        });
        expect(result.success).toBe(true);
        if (result.success) expect(result.output.roster).toBeNull();
    });

    it('trims the classroom name and org into domain values', () => {
        const result = v.safeParse(CreateClassroomInputSchema, {
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
        const result = v.safeParse(CreateClassroomInputSchema, {
            name: 'Algorithms',
            org: 'not an org!',
            rosterCsv: null,
            rosterText: null,
        });
        expect(result.success).toBe(false);
    });

    it('rejects roster content over the size cap', () => {
        const result = v.safeParse(CreateClassroomInputSchema, {
            name: 'Algorithms',
            org: 'acme-edu',
            rosterCsv: 'x'.repeat(ROSTER_SOURCE_MAX_LENGTH + 1),
            rosterText: null,
        });
        expect(result.success).toBe(false);
    });
});
