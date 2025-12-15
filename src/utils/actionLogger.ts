import { db } from "../config/db";
import { actionLogs } from "../db/schema";
import { Request } from "express";

export const logAction = async (
     req: Request,
     action: string,
     target?: string,
     details?: string
) => {
     try {
          const user = (req as any).user;
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
          const userAgent = req.headers['user-agent'];

          await db.insert(actionLogs).values({
               actorId: user?.id || null,
               actorName: user?.name || user?.nim || user?.email || 'System/Guest',
               action,
               target: target || null,
               details: details || null,
               ipAddress: Array.isArray(ip) ? ip[0] : ip || 'Unknown',
               userAgent: userAgent || null,
          });
     } catch (error) {
          console.error("Failed to log action:", error);
     }
};
