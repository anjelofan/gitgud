/** Decodes a single text form field; non-string values decode to the empty string. */
function stringField(formData: FormData, key: string): string {
    const value = formData.get(key);
    return typeof value === 'string' ? value : '';
}

/** Decodes an optional roster source: absent fields decode to `null`, files to their text content. */
async function rosterSource(formData: FormData, key: string): Promise<string | null> {
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
