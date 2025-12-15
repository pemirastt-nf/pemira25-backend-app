import { pgTable, text, boolean, timestamp, integer, uuid } from 'drizzle-orm/pg-core';


export const users = pgTable('users', {
     id: uuid('id').defaultRandom().primaryKey(),
     nim: text('nim').unique().notNull(),
     email: text('email').unique(),
     name: text('name'),
     password: text('password'),
     role: text('role').notNull().default('voter'), // 'admin', 'voter'
     hasVoted: boolean('has_voted').default(false),
     votedAt: timestamp('voted_at'),
     createdAt: timestamp('created_at').defaultNow(),
     deletedAt: timestamp('deleted_at'), // Soft Delete
});

export const candidates = pgTable('candidates', {
     id: uuid('id').defaultRandom().primaryKey(),
     name: text('name').notNull(),
     vision: text('vision').notNull(),
     mission: text('mission').notNull(),
     photoUrl: text('photo_url'),
     orderNumber: integer('order_number').unique().notNull(),
     createdAt: timestamp('created_at').defaultNow(),
     deletedAt: timestamp('deleted_at'), // Soft Delete
});

export const votes = pgTable('votes', {
     id: uuid('id').defaultRandom().primaryKey(),
     candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
     timestamp: timestamp('timestamp').defaultNow(),
     source: text('source').default('online'),
});

export const otpCodes = pgTable('otp_codes', {
     id: uuid('id').defaultRandom().primaryKey(),
     email: text('email').notNull(),
     code: text('code').notNull(),
     expiresAt: timestamp('expires_at').notNull(),
     createdAt: timestamp('created_at').defaultNow(),
});

export const actionLogs = pgTable('action_logs', {
     id: uuid('id').defaultRandom().primaryKey(),
     actorId: uuid('actor_id'), // Can be null if system action or deleted user
     actorName: text('actor_name'), // Snapshot of actor name
     action: text('action').notNull(),
     target: text('target'),
     details: text('details'),
     ipAddress: text('ip_address'),
     userAgent: text('user_agent'),
     timestamp: timestamp('timestamp').defaultNow(),
});
