import { pgTable, text, boolean, timestamp, integer, uuid, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';


export const users = pgTable('users', {
     id: uuid('id').defaultRandom().primaryKey(),
     nim: text('nim').unique().notNull(),
     email: text('email').unique(),
     name: text('name'),
     password: text('password'),
     role: text('role').notNull().default('voter'), // 'super_admin', 'panitia', 'voter'
     batch: text('batch'), // Angkatan
     // Voting Status & Method
     hasVoted: boolean('has_voted').default(false),
     votedAt: timestamp('voted_at', { withTimezone: true }),
     accessType: text('access_type').default('online'), // 'online' | 'offline' (Eligibility)
     voteMethod: text('vote_method'), // 'online' | 'offline' (Actual method used)

     // Offline Verification Audit
     checkedInAt: timestamp('checked_in_at'),
     checkedInBy: uuid('checked_in_by'), // Operator ID who verified

     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
     deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft Delete
});

export const candidates = pgTable('candidates', {
     id: uuid('id').defaultRandom().primaryKey(),
     name: text('name').notNull(),
     vision: text('vision').notNull(),
     mission: text('mission').notNull(),
     photoUrl: text('photo_url'),
     orderNumber: integer('order_number').unique().notNull(),
     programs: text('programs'), // New line-separated programs
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
     deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft Delete
});

// Chat System Schema
export const chatSessions = pgTable('chat_sessions', {
     id: uuid('id').defaultRandom().primaryKey(),
     studentId: uuid('student_id').references(() => users.id, { onDelete: 'cascade' }),
     // Store basic info for guest/quick access if needed, or link to User
     guestName: text('guest_name'),
     guestEmail: text('guest_email'),

     // Session Status
     status: text('status', { enum: ['open', 'closed', 'archived'] }).default('open').notNull(),

     // Metadata
     deviceInfo: text('device_info'),
     ipAddress: text('ip_address'),

     lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow(),
     lastMessageBy: text('last_message_by', { enum: ['student', 'panitia', 'super_admin', 'system'] }), // Updated roles
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
     updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
     id: uuid('id').defaultRandom().primaryKey(),
     sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }).notNull(),

     // Sender Info
     senderType: text('sender_type', { enum: ['student', 'panitia', 'super_admin', 'system'] }).notNull(),
     senderId: uuid('sender_id'), // Nullable (if guest or system)

     // Content
     message: text('message').notNull(),
     isRead: boolean('is_read').default(false),

     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
     student: one(users, {
          fields: [chatSessions.studentId],
          references: [users.id],
     }),
     messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
     session: one(chatSessions, {
          fields: [chatMessages.sessionId],
          references: [chatSessions.id],
     }),
}));

export const votes = pgTable('votes', {
     id: uuid('id').defaultRandom().primaryKey(),
     candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
     timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
     source: text('source').default('online'),
});

export const otpCodes = pgTable('otp_codes', {
     id: uuid('id').defaultRandom().primaryKey(),
     email: text('email').notNull(),
     code: text('code').notNull(),
     expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const offlineVoteLogs = pgTable('offline_vote_logs', {
     id: uuid('id').defaultRandom().primaryKey(),
     candidateId: uuid('candidate_id').references(() => candidates.id).notNull(),
     count: integer('count').notNull(),
     inputBy: uuid('input_by').references(() => users.id), // Panitia who input
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
     timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
});

export const systemSettings = pgTable('system_settings', {
     id: uuid('id').defaultRandom().primaryKey(),
     isVoteOpen: boolean('is_vote_open').default(false).notNull(),
     startDate: timestamp('start_date', { withTimezone: true }),
     endDate: timestamp('end_date', { withTimezone: true }),
     announcementMessage: text('announcement_message'),
     showAnnouncement: boolean('show_announcement').default(false).notNull(),
     updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const broadcasts = pgTable('broadcasts', {
     id: uuid('id').defaultRandom().primaryKey(),
     subject: text('subject').notNull(),
     content: text('content').notNull(), // HTML content
     filters: jsonb('filters').default({ target: 'all' }), // { target: 'all'|'batch'|'unvoted', batches: [], cta: { text: '', url: '' } }
     status: text('status', { enum: ['draft', 'processing', 'completed', 'failed'] }).default('draft').notNull(),
     stats: jsonb('stats').default({ total: 0, sent: 0, failed: 0 }),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
     updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
     createdBy: text('created_by'), // Admin email or ID
});
