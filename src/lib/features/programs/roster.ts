import type { Roster } from './contracts.ts';

/** Strips a leading UTF-8 byte-order mark left by spreadsheet CSV exports. */
function stripByteOrderMark(content: string) {
    return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

/**
 * Parses a CSV record into fields, honoring double-quoted fields that may
 * contain commas or escaped quotes (`""`). Implements the minimal subset of
 * RFC 4180 the roster upload needs; newlines inside quoted fields are not
 * supported. A quote inside an unquoted field is a literal character, so a
 * name such as `Ada "Ace" Lovelace` parses instead of failing the upload.
 */
function parseCsvRecord(record: string) {
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
        } else if (quoted) {
            field += char;
        } else if (char === '"') {
            if (field === '') quoted = true;
            else field += char;
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
export function parseCsvRoster(content: string) {
    return stripByteOrderMark(content)
        .split(/\r\n|\n|\r/u)
        .map((record) => {
            const [firstField] = parseCsvRecord(record);
            return firstField.trim();
        })
        .filter((name) => name !== '');
}

/** Parses a newline-separated list of student names. */
export function parseTextRoster(content: string) {
    return stripByteOrderMark(content)
        .split(/\r\n|\n|\r/u)
        .map((line) => line.trim())
        .filter((name) => name !== '');
}

function parseRosterSource(roster: Roster) {
    if (roster.format === 'csv') return parseCsvRoster(roster.content);
    return parseTextRoster(roster.content);
}

/** Parses either roster source into a normalized, de-duplicated student-name list. */
export function parseRoster(roster: Roster | null) {
    const names = roster === null ? [] : parseRosterSource(roster);
    return [...new Set(names)];
}
