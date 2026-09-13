import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { programs } from './programs.ts';

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

export type Assignment = typeof assignments.$inferSelect;
