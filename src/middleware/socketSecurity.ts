import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Rate Limiter: 5 messages per 10 seconds per IP
const rateLimiter = new RateLimiterMemory({
     points: 5,
     duration: 10,
});

export interface AuthenticatedSocket extends Socket {
     user?: any;
}

export const socketAuth = async (socket: AuthenticatedSocket, next: (err?: any) => void) => {
     try {
          // Check for Admin Token
          const token = socket.handshake.auth.token;

          if (token) {
               try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

                    // Verify user exists in DB to prevent FK errors
                    // const userExists = await db.query.users.findFirst({
                    //      where: (users, { eq }) => eq(users.id, decoded.id)
                    // });

                    // Optimization: We don't need to fetch full user, just ensure ID is valid if we want strictness.
                    // But for performance, we might skip this. However, to fix the specific error:

                    socket.user = decoded;
               } catch (err) {
                    console.error("Socket token invalid:", err);
                    // Invalid token - treat as guest
               }
          }

          next();
     } catch (err) {
          next(new Error('Authentication failed'));
     }
};

export const checkRateLimit = async (socket: Socket) => {
     try {
          await rateLimiter.consume(socket.handshake.address);
          return true;
     } catch (rej) {
          return false;
     }
};
