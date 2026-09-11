import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

import { users } from './auth.ts';

export const programs = pgTable(
    'programs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: text('name').notNull(),
        org: text('org').notNull(),
        instructorId: uuid('instructor_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => sql`now()`),
    },
    (table) => [index('programs_instructor_id_idx').on(table.instructorId)],
);

export const rosterEntries = pgTable(
    'roster_entries',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        programId: uuid('program_id')
            .notNull()
            .references(() => programs.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [uniqueIndex('roster_entries_program_id_name_idx').on(table.programId, table.name)],
);

export type Program = typeof programs.$inferSelect;
export type RosterEntry = typeof rosterEntries.$inferSelect;

export const programsRelations = relations(programs, ({ many, one }) => ({
    rosterEntries: many(rosterEntries),
    instructor: one(users, { fields: [programs.instructorId], references: [users.id] }),
}));

export const rosterEntriesRelations = relations(rosterEntries, ({ one }) => ({
    program: one(programs, {
        fields: [rosterEntries.programId],
        references: [programs.id],
    }),
}));
