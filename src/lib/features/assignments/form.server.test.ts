import { describe, expect, it } from 'vitest';

import { isKnownOrgRepo } from './form.server.ts';

describe('isKnownOrgRepo', () => {
    it('accepts a submitted repo that exists in the organization', () => {
        expect(isKnownOrgRepo(['dtp2627a-0', 'dtp2627a-1'], 'dtp2627a-0')).toBe(true);
    });

    it('rejects a submitted repo that is missing from the organization', () => {
        expect(isKnownOrgRepo(['dtp2627a-0'], 'foreign-repo')).toBe(false);
    });

    it('rejects any submitted repo when the organization has none', () => {
        expect(isKnownOrgRepo([], 'dtp2627a-0')).toBe(false);
    });
});
