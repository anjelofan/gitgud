import { describe, expect, it } from 'vitest';

import {
    namesToAdd,
    parseCsvRoster,
    parseRoster,
    parseTextRoster,
    rosterCapacityExceeded,
} from './roster.ts';
import { ROSTER_MAX_STUDENTS } from './contracts.ts';

describe('parseCsvRoster', () => {
    it('takes the first column of each row as the student name', () => {
        const content = 'Ada Lovelace,ada@example.com,section 1\nGrace Hopper,grace@example.com\n';
        expect(parseCsvRoster(content)).toEqual(['Ada Lovelace', 'Grace Hopper']);
    });

    it('handles quoted fields containing commas and escaped quotes', () => {
        const content = '"Hopper, Grace","x"\n"Robot ""R"" 3000",y\n';
        expect(parseCsvRoster(content)).toEqual(['Hopper, Grace', 'Robot "R" 3000']);
    });

    it('treats every row as a name, including the first', () => {
        const content = 'Ada Lovelace\nName,Extra\n';
        expect(parseCsvRoster(content)).toEqual(['Ada Lovelace', 'Name']);
    });

    it('supports CRLF and lone CR line endings', () => {
        expect(parseCsvRoster('Ada Lovelace\r\nGrace Hopper\rAlan Turing\n')).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
            'Alan Turing',
        ]);
    });

    it('drops blank lines and whitespace-only first fields', () => {
        const content = 'Ada Lovelace\n\n   ,leftover\n  \nGrace Hopper\n';
        expect(parseCsvRoster(content)).toEqual(['Ada Lovelace', 'Grace Hopper']);
    });

    it('treats a quote inside an unquoted field as a literal character', () => {
        expect(parseCsvRoster('Ada "Ace" Lovelace\n')).toEqual(['Ada "Ace" Lovelace']);
    });

    it('strips a leading UTF-8 byte-order mark', () => {
        expect(parseCsvRoster('\uFEFFAda Lovelace\nGrace Hopper\n')).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
        ]);
    });
});

describe('parseTextRoster', () => {
    it('splits names on newlines and trims them', () => {
        expect(parseTextRoster('  Ada Lovelace \nGrace Hopper\n\nAlan Turing\n')).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
            'Alan Turing',
        ]);
    });

    it('keeps inner whitespace and commas as part of the name', () => {
        expect(parseTextRoster('Hopper, Grace')).toEqual(['Hopper, Grace']);
    });

    it('strips a leading UTF-8 byte-order mark', () => {
        expect(parseTextRoster('\uFEFFAda Lovelace\nGrace Hopper')).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
        ]);
    });
});

describe('parseRoster', () => {
    it('returns an empty roster when no source was provided', () => {
        expect(parseRoster(null)).toEqual([]);
    });

    it('parses the text-box roster', () => {
        expect(parseRoster({ format: 'text', content: 'Ada Lovelace\nGrace Hopper' })).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
        ]);
    });

    it('collapses duplicate names within one source', () => {
        expect(parseRoster({ format: 'text', content: 'Ada Lovelace\nAda Lovelace\n' })).toEqual([
            'Ada Lovelace',
        ]);
    });

    it('collapses duplicate names in a CSV roster', () => {
        expect(
            parseRoster({ format: 'csv', content: 'Ada Lovelace\nAda Lovelace,Grace Hopper\n' }),
        ).toEqual(['Ada Lovelace']);
    });
});

describe('namesToAdd', () => {
    it('returns only names not already on the roster', () => {
        expect(namesToAdd(['Ada Lovelace'], ['Ada Lovelace', 'Grace Hopper'])).toEqual([
            'Grace Hopper',
        ]);
    });

    it('matches existing names case-sensitively', () => {
        expect(namesToAdd(['ada lovelace'], ['Ada Lovelace'])).toEqual(['Ada Lovelace']);
    });

    it('collapses duplicate incoming names', () => {
        expect(namesToAdd(['Grace Hopper'], ['Ada Lovelace', 'Ada Lovelace'])).toEqual([
            'Ada Lovelace',
        ]);
    });
});

describe('rosterCapacityExceeded', () => {
    it('returns null when the roster stays within the cap', () => {
        expect(rosterCapacityExceeded(ROSTER_MAX_STUDENTS - 1, 1)).toBeNull();
    });

    it('returns a stable message when the cap would be exceeded', () => {
        expect(rosterCapacityExceeded(ROSTER_MAX_STUDENTS, 1)).toBe(
            `Roster must contain at most ${ROSTER_MAX_STUDENTS} students.`,
        );
    });
});
