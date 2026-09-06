import { describe, expect, it } from 'vitest';

import { parseCsvRoster, parseRoster, parseTextRoster } from './roster.ts';

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
});
