/** Decodes a single text form field; non-string values decode to the empty string. */
function stringField(formData: FormData, key: string) {
    const value = formData.get(key);
    return typeof value === 'string' ? value : '';
}

/** Decodes an optional roster source: absent fields decode to `null`, files to their text content. */
async function rosterSource(formData: FormData, key: string) {
    const value = formData.get(key);
    if (value === null) return null;
    if (typeof value === 'string') return value;
    return await value.text();
}

/**
 * Representation-only decode of the create-program form; validation happens
 * at the action boundary through `CreateProgramInputSchema`.
 */
export async function decodeCreateProgramForm(formData: FormData) {
    return {
        name: stringField(formData, 'name'),
        org: stringField(formData, 'org'),
        rosterCsv: await rosterSource(formData, 'rosterCsv'),
        rosterText: await rosterSource(formData, 'rosterText'),
    };
}

/** Representation-only decode of the add-roster batch form on the program dashboard. */
export async function decodeAddRosterBatchForm(formData: FormData) {
    return {
        rosterCsv: await rosterSource(formData, 'rosterCsv'),
        rosterText: await rosterSource(formData, 'rosterText'),
    };
}

export function decodeAddStudentForm(formData: FormData) {
    return { name: stringField(formData, 'name') };
}

export function decodeRenameStudentForm(formData: FormData) {
    return {
        entryId: stringField(formData, 'entryId'),
        name: stringField(formData, 'name'),
    };
}

export function decodeRemoveStudentsForm(formData: FormData) {
    const entryIds = formData
        .getAll('entryIds')
        .filter((value): value is string => typeof value === 'string');
    return { entryIds };
}
