import * as v from 'valibot';

export const OrgMembershipSchema = v.object({
    state: v.picklist(['active', 'pending']),
    role: v.picklist(['admin', 'member']),
});
export type OrgMembership = v.InferOutput<typeof OrgMembershipSchema>;
