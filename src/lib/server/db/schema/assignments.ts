import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { programs, rosterEntries } from './programs.ts';

export const assignments = pgTable(
    'assignments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        programId: uuid('program_id')
            .notNull()
            .references(() => programs.id, { onDelete: 'cascade' }),
        name: text('assignment_name').notNull(),
        deadline: timestamp('deadline', { withTimezone: true }).notNull(),
        inviteToken: text('invite_token').notNull().unique(),
        templateRepo: text('template_repo').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => sql`now()`),
    },
    (table) => [index('assignments_program_id_idx').on(table.programId)],
);

export const submissions = pgTable(
    'submissions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        assignmentId: uuid('assignment_id')
            .notNull()
            .references(() => assignments.id, { onDelete: 'cascade' }),
        rosterEntryId: uuid('roster_entry_id')
            .notNull()
            .references(() => rosterEntries.id, { onDelete: 'cascade' }),
        repoName: text('repo_name').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex('submissions_assignment_id_roster_entry_id_idx').on(
            table.assignmentId,
            table.rosterEntryId,
        ),
        index('submissions_roster_entry_id_idx').on(table.rosterEntryId),
    ],
);

export type Assignment = typeof assignments.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
