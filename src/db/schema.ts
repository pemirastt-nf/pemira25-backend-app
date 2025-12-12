import { pgTable, text, boolean, timestamp, integer, uuid } from 'drizzle-orm/pg-core';


export const users = pgTable('users', {
     id: uuid('id').defaultRandom().primaryKey(),
     nim: text('nim').unique().notNull(),
     email: text('email').unique(), // Made optional temporarily to avoid migration issues with existing data, or could be notNull if we wipe data. Let's make it unique but nullable for now, or better yet, enforce it.
     name: text('name'),
     passwordHash: text('password_hash').notNull(),
     role: text('role').notNull().default('voter'), // 'admin', 'voter'
     hasVoted: boolean('has_voted').default(false),
     createdAt: timestamp('created_at').defaultNow(),
});

export const candidates = pgTable('candidates', {
     id: uuid('id').defaultRandom().primaryKey(),
     name: text('name').notNull(),
     vision: text('vision').notNull(),
     mission: text('mission').notNull(), // Stored as text, can be split by newline in app
     photoUrl: text('photo_url'),
     orderNumber: integer('order_number').unique().notNull(),
     createdAt: timestamp('created_at').defaultNow(),
});

export const votes = pgTable('votes', {
     id: uuid('id').defaultRandom().primaryKey(),
     voterId: uuid('voter_id').notNull().references(() => users.id),
     candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
     timestamp: timestamp('timestamp').defaultNow(),
});

export const otpCodes = pgTable('otp_codes', {
     id: uuid('id').defaultRandom().primaryKey(),
     email: text('email').notNull(),
     code: text('code').notNull(),
     expiresAt: timestamp('expires_at').notNull(),
     createdAt: timestamp('created_at').defaultNow(),
});
