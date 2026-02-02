import { Router } from 'express';
import { db } from '../config/db';
import { users, actionLogs } from '../db/schema';
import { eq, desc, and, or, ilike, SQL } from 'drizzle-orm';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/adminAuth';
import bcrypt from 'bcrypt';
import { logAction } from '../utils/actionLogger';

const router = Router();

router.use(authenticateAdmin, requireSuperAdmin);

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin user management and logs
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users (Super Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *       403:
 *         description: Forbidden
 */
router.get('/users', async (req, res) => {
     try {
          const result = await db.select().from(users);
          res.json(result);
     } catch (error) {
          console.error('Error fetching users:', error);
          res.status(500).json({ error: 'Internal Server Error' });
     }
});

/**
 * @swagger
 * /api/admin/users/{id}:
 *   patch:
 *     summary: Update user details (Role, Name, Email, Password)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [voter, panitia, super_admin, operator_tps, operator_suara, operator_chat]
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated
 *       400:
 *         description: Invalid input
 *       404:
 *         description: User not found
 */
router.patch('/users/:id', async (req, res) => {
     const { id } = req.params;
     const { name, email, role, password } = req.body;

     if (role && !['voter', 'panitia', 'super_admin', 'operator_tps', 'operator_suara', 'operator_chat'].includes(role)) {
          return res.status(400).json({ error: 'Invalid role' });
     }

     try {
          const updateData: any = {};
          if (name) updateData.name = name;
          if (email) updateData.email = email;
          if (role) updateData.role = role;

          if (password) {
               const salt = await bcrypt.genSalt(10);
               updateData.password = await bcrypt.hash(password, salt);
          }

          if (Object.keys(updateData).length === 0) {
               return res.status(400).json({ error: 'No data to update' });
          }

          const [updatedUser] = await db.update(users)
               .set(updateData)
               .where(eq(users.id, id))
               .returning();

          if (!updatedUser) {
               return res.status(404).json({ error: 'User not found' });
          }

          res.json(updatedUser);

          // Smart Logging
          let actionType = 'UPDATE_USER';
          if (role === 'panitia' || role?.startsWith('operator_')) actionType = 'PROMOTE_COMMITTEE';
          if (role === 'voter') actionType = 'DEMOTE_COMMITTEE';

          let details = `User: ${updatedUser.name} (${updatedUser.nim})`;
          if (role) details += `, Roles To: ${role}`;
          if (name || email) details += `, Info Updated`;

          await logAction(req, actionType, details);
     } catch (error) {
          console.error('Error updating user:', error);
          res.status(500).json({ error: 'Failed to update user' });
     }
});

/**
 * @swagger
 * /api/admin/logs:
 *   get:
 *     summary: Get audit logs
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of audit logs
 */
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
