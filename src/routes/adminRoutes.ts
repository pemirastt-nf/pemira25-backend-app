import { Router } from 'express';
import { db } from '../config/db';
import { users, actionLogs } from '../db/schema';
import { eq, desc, and, or, ilike, SQL } from 'drizzle-orm';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/adminAuth';
import bcrypt from 'bcrypt';
import { logAction } from '../utils/actionLogger';

const router = Router();

router.use(authenticateAdmin, requireSuperAdmin);

router.get('/users', async (req, res) => {
     try {
          const result = await db.select().from(users);
          res.json(result);
     } catch (error) {
          console.error('Error fetching users:', error);
          res.status(500).json({ error: 'Internal Server Error' });
     }
});

router.patch('/users/:id/role', async (req, res) => {
     const { id } = req.params;
     const { role, password } = req.body; // 'voter', 'panitia', 'super_admin'

     if (!['voter', 'panitia', 'super_admin'].includes(role)) {
          return res.status(400).json({ error: 'Invalid role' });
     }

     try {
          const updateData: any = { role };

          // If password is provided (e.g. promoting a student to admin), hash and set it
          if (password) {
               const salt = await bcrypt.genSalt(10);
               updateData.password = await bcrypt.hash(password, salt);
          }

          const [updatedUser] = await db.update(users)
               .set(updateData)
               .where(eq(users.id, id))
               .returning();

          if (!updatedUser) {
               return res.status(404).json({ error: 'User not found' });
          }

          res.json(updatedUser);

          const actionType = role === 'panitia' ? 'PROMOTE_COMMITTEE' : (role === 'voter' ? 'DEMOTE_COMMITTEE' : 'UPDATE_ROLE');
          await logAction(req, actionType, `User: ${updatedUser.name} (${updatedUser.nim}), To: ${role}`);
     } catch (error) {
          console.error('Error updating role:', error);
          res.status(500).json({ error: 'Failed to update role' });
     }
});

// Get Action Logs (Super Admin Only)
router.get('/logs', async (req, res) => {
     try {
          const { page = 1, limit = 50, search, action } = req.query;
          const offset = (Number(page) - 1) * Number(limit);

          const conditions: SQL[] = [];

          if (search) {
               const searchStr = `%${search}%`;
               conditions.push(or(
                    ilike(actionLogs.actorName, searchStr),
                    ilike(actionLogs.target, searchStr),
                    ilike(actionLogs.details, searchStr)
               )!);
          }

          if (action && action !== 'ALL') {
               conditions.push(eq(actionLogs.action, String(action)));
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          const logs = await db.select()
               .from(actionLogs)
               .where(whereClause)
               .orderBy(desc(actionLogs.timestamp))
               .limit(Number(limit))
               .offset(offset);

          const totalRes = await db.select({ count: actionLogs.id })
               .from(actionLogs)
               .where(whereClause);

          const total = totalRes.length;

          res.json({
               data: logs,
               pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total
               }
          });
     } catch (error) {
          console.error('Error fetching logs:', error);
          res.status(500).json({ error: 'Internal Server Error' });
     }
});

export default router;
