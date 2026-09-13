import { relations } from 'drizzle-orm';

import { githubTokens, sessions, users } from './auth.ts';
import { programs, rosterEntries } from './programs.ts';
import { assignments } from './assignments.ts';

export const usersRelations = relations(users, ({ many, one }) => ({
    sessions: many(sessions),
    githubTokens: one(githubTokens, {
        fields: [users.id],
        references: [githubTokens.userId],
    }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const githubTokensRelations = relations(githubTokens, ({ one }) => ({
    user: one(users, { fields: [githubTokens.userId], references: [users.id] }),
}));

export const programsRelations = relations(programs, ({ many, one }) => ({
    rosterEntries: many(rosterEntries),
    instructor: one(users, { fields: [programs.instructorId], references: [users.id] }),
    assignments: many(assignments),
}));

export const rosterEntriesRelations = relations(rosterEntries, ({ one }) => ({
    program: one(programs, {
        fields: [rosterEntries.programId],
        references: [programs.id],
    }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
    program: one(programs, {
        fields: [assignments.programId],
        references: [programs.id],
    }),
}));
