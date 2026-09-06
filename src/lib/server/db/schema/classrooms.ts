import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

import { users } from './auth.ts';

export const classrooms = pgTable(
    'classrooms',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: text('name').notNull(),
        org: text('org').notNull(),
        createdById: uuid('created_by_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => sql`now()`),
    },
    (table) => [index('classrooms_created_by_id_idx').on(table.createdById)],
);

export const rosterEntries = pgTable(
    'roster_entries',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        classroomId: uuid('classroom_id')
            .notNull()
            .references(() => classrooms.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex('roster_entries_classroom_id_name_idx').on(table.classroomId, table.name),
    ],
);

export type Classroom = typeof classrooms.$inferSelect;
export type RosterEntry = typeof rosterEntries.$inferSelect;

export const classroomsRelations = relations(classrooms, ({ many, one }) => ({
    rosterEntries: many(rosterEntries),
    createdBy: one(users, { fields: [classrooms.createdById], references: [users.id] }),
}));

export const rosterEntriesRelations = relations(rosterEntries, ({ one }) => ({
    classroom: one(classrooms, {
        fields: [rosterEntries.classroomId],
        references: [classrooms.id],
    }),
}));
