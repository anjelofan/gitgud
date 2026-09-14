/** Decodes a single text form field; non-string values decode to the empty string. */
function stringField(formData: FormData, key: string) {
    const value = formData.get(key);
    return typeof value === 'string' ? value : '';
}

/**
 * Representation-only decode of the create-assignment form; validation happens
 * at the action boundary through `CreateAssignmentInputSchema`.
 */
export function decodeCreateAssignmentForm(formData: FormData) {
    return {
        name: stringField(formData, 'name'),
        deadline: stringField(formData, 'deadline'),
        templateRepo: stringField(formData, 'templateRepo'),
    };
}