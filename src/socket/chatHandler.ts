import { Server, Socket } from 'socket.io';
import { db } from '../config/db';
import { chatSessions, chatMessages } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { AuthenticatedSocket, checkRateLimit } from '../middleware/socketSecurity';
import { z } from 'zod';

const messageSchema = z.object({
     message: z.string().min(1).max(500),
     sessionId: z.string().uuid().optional(), // If not provided, might be creating new session
});

export const requestChatHandler = (io: Server) => {
     io.on('connection', (socket: AuthenticatedSocket) => {
          console.log(`Socket connected: ${socket.id}`);

          // --- User (Student/Guest) Events ---

          socket.on('join_student', async (data: { studentId?: string, sessionId?: string, guestInfo?: { name: string, email: string } }) => {
               try {
                    let sessionId;

                    // 1. Try to resume if sessionId provided
                    if (data.sessionId) {
                         const existingSession = await db.query.chatSessions.findFirst({
                              where: (sessions, { eq }) => eq(sessions.id, data.sessionId!)
                         });

                         if (existingSession && existingSession.status === 'open') {
                              sessionId = existingSession.id;
                         }
                    }

                    // 2. If not resumed, try to find existing open session for studentId
                    if (!sessionId && data.studentId) {
                         const studentId = data.studentId;
                         const existingSession = await db.query.chatSessions.findFirst({
                              where: (sessions, { eq, and }) => and(
                                   eq(sessions.studentId, studentId),
                                   eq(sessions.status, 'open')
                              )
                         });

                         if (existingSession) {
                              sessionId = existingSession.id;
                         } else {
                              // Verify student exists before creating session (Prevent FK Error)
                              const studentExists = await db.query.users.findFirst({
                                   columns: { id: true },
                                   where: (users, { eq }) => eq(users.id, studentId)
                              });

                              if (!studentExists) {
                                   console.error(`Attempt to create session for non-existent student: ${studentId}`);
                                   return socket.emit('error', 'User not found. Please re-login.');
                              }

                              const [newSession] = await db.insert(chatSessions).values({
                                   studentId: data.studentId,
                                   status: 'open',
                                   ipAddress: socket.handshake.address
                              }).returning();
                              sessionId = newSession.id;
                         }
                    }

                    // 3. Guest Logic (New Session if not resumed)
                    if (!sessionId && !data.studentId) {
                         // Only create new guest session if guestInfo is provided
                         if (data.guestInfo?.name && data.guestInfo?.email) {
                              const [newSession] = await db.insert(chatSessions).values({
                                   guestName: data.guestInfo.name,
                                   guestEmail: data.guestInfo.email,
                                   status: 'open',
                                   ipAddress: socket.handshake.address
                              }).returning();
                              sessionId = newSession.id;
                         } else {
                              // If trying to join as guest but no info and no valid session to resume -> Error or just return
                              // Client will likely show form if this fails to return session_joined
                              return;
                         }
                    }

                    if (sessionId) {
                         socket.join(sessionId);
                         socket.emit('session_joined', { sessionId });

                         // Load history
                         const history = await db.query.chatMessages.findMany({
                              where: (msgs, { eq }) => eq(msgs.sessionId, sessionId!),
                              orderBy: (msgs, { asc }) => [asc(msgs.createdAt)],
                              limit: 50
                         });
                         socket.emit('message_history', history);

                         // Notify admins
                         io.to('admin_room').emit('new_session', { sessionId });
                    }

               } catch (err) {
                    console.error('Join student error:', err);
                    socket.emit('error', 'Failed to join chat');
               }
          });

          socket.on('send_message', async (data) => {
               if (!(await checkRateLimit(socket))) {
                    return socket.emit('error', 'Rate limit exceeded. Please wait.');
               }

               const validation = messageSchema.safeParse(data);
               if (!validation.success) {
                    return socket.emit('error', 'Invalid message format');
               }

               const { message, sessionId } = validation.data;
               if (!sessionId) return; // Must have session

               try {


                    // Store message
                    const [savedMsg] = await db.insert(chatMessages).values({
                         sessionId,
                         senderType: 'student',
                         senderId: socket.user?.id,
                         message: data.message
                    }).returning();

                    // Update session
                    await db.update(chatSessions).set({
                         lastMessageAt: new Date(),
                         lastMessageBy: 'student',
                         updatedAt: new Date()
                    }).where(eq(chatSessions.id, sessionId));

                    // Emit to room (admins and this student)
                    io.to(sessionId).emit('new_message', savedMsg);

                    // Notify admins of update
                    io.emit('session_update', {
                         sessionId,
                         lastMessage: data.message,
                         lastMessageBy: 'student'
                    });
               } catch (error) {
                    console.error("Msg error:", error);
               }
          });


          const allowedAdminRoles = ['super_admin', 'panitia'];

          socket.on('join_admin', () => {
               if (socket.user && allowedAdminRoles.includes(socket.user.role)) {
                    socket.join('admin_room');
                    console.log(`Admin ${socket.user.id} (${socket.user.role}) joined admin_room`);
               }
          });

          socket.on('admin_join_session', async (sessionId: string) => {
               if (socket.user && allowedAdminRoles.includes(socket.user.role)) {
                    socket.join(sessionId);

                    // Send history
                    const history = await db.query.chatMessages.findMany({
                         where: (msgs, { eq }) => eq(msgs.sessionId, sessionId),
                         orderBy: (msgs, { asc }) => [asc(msgs.createdAt)]
                    });
                    socket.emit('message_history', history);
               }
          });

          socket.on('admin_send_message', async (data) => {
               if (!socket.user || !allowedAdminRoles.includes(socket.user.role)) return;

               const validation = messageSchema.safeParse(data);
               if (!validation.success) return;

               const { message, sessionId } = validation.data;
               if (!sessionId) return;

               const senderRole = socket.user.role; // 'panitia' or 'super_admin'

               try {
                    const [msg] = await db.insert(chatMessages).values({
                         sessionId,
                         senderType: senderRole,
                         senderId: socket.user.id,
                         message
                    }).returning();

                    await db.update(chatSessions).set({
                         lastMessageAt: new Date(),
                         lastMessageBy: senderRole,
                         updatedAt: new Date()
                    }).where(eq(chatSessions.id, sessionId));

                    io.to(sessionId).emit('new_message', msg);

                    // Also emit update so list shows latest msg
                    io.emit('session_update', {
                         sessionId,
                         lastMessage: message,
                         lastMessageBy: senderRole
                    });
               } catch (err) {
                    console.error('Admin send error:', err);
               }
          });
     });
};
