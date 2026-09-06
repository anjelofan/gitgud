import type { Roster } from './contracts.ts';

/**
 * Parses a CSV record into fields, honoring double-quoted fields that may
 * contain commas or escaped quotes (`""`). Implements the minimal subset of
 * RFC 4180 the roster upload needs; newlines inside quoted fields are not
 * supported.
 */
function parseCsvRecord(record: string): string[] {
    const fields: string[] = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < record.length; index += 1) {
        const char = record[index];
        if (quoted && char === '"' && record[index + 1] === '"') {
            field += '"';
            index += 1;
        } else if (quoted && char === '"') {
            quoted = false;
        } else if (char === '"') {
            if (field !== '') throw new Error('unexpected quote inside unquoted CSV field');
            quoted = true;
        } else if (char === ',') {
            fields.push(field);
            field = '';
        } else {
            field += char;
        }
    }
    fields.push(field);
    return fields;
}

/** Parses the first column of a newline-separated CSV roster into student names. */
export function parseCsvRoster(content: string): string[] {
    return content
        .split(/\r\n|\n|\r/u)
        .map((record) => {
            const [firstField] = parseCsvRecord(record);
            return firstField.trim();
        })
        .filter((name) => name !== '');
}

/** Parses a newline-separated list of student names. */
export function parseTextRoster(content: string): string[] {
    return content
        .split(/\r\n|\n|\r/u)
        .map((line) => line.trim())
        .filter((name) => name !== '');
}

function parseRosterSource(roster: Roster): string[] {
    if (roster.format === 'csv') return parseCsvRoster(roster.content);
    return parseTextRoster(roster.content);
}

/** Parses either roster source into a normalized, de-duplicated student-name list. */
export function parseRoster(roster: Roster | null): string[] {
    const names = roster === null ? [] : parseRosterSource(roster);
    return [...new Set(names)];
}
