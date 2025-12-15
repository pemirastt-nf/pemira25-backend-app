import { Router } from 'express';
import { db } from '../config/db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/adminAuth';
import bcrypt from 'bcrypt';

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
     } catch (error) {
          console.error('Error updating role:', error);
          res.status(500).json({ error: 'Failed to update role' });
     }
});

export default router;
