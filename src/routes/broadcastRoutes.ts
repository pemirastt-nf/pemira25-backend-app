import { Router } from 'express';
import { db } from '../config/db';
import { users } from '../db/schema';
import { eq, inArray, and, isNull } from 'drizzle-orm';
import { authenticateAdmin } from '../middleware/adminAuth';
import { addBroadcastJob } from '../queue/emailQueue';
import { logAction } from '../utils/actionLogger';
import { formatEmailHtml } from '../config/mail';

const router = Router();

// Secure all broadcast routes
router.use(authenticateAdmin);

/**
 * @swagger
 * tags:
 *   name: Broadcast
 *   description: Broadcast email management
 */

/**
 * @swagger
 * /api/broadcast/preview:
 *   post:
 *     summary: Preview a broadcast template
 *     tags: [Broadcast]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               template:
 *                 type: string
 *               nim:
 *                 type: string
 *     responses:
 *       200:
 *         description: Preview HTML
 */
router.post('/preview', async (req, res) => {
     const { template, nim } = req.body;

     if (!template) {
          return res.status(400).json({ message: 'Template is required' });
     }

     try {
          let data: Record<string, string> = {
               name: 'Contoh Mahasiswa',
               nim: '0110221001',
               email: 'contoh@student.nurulfikri.ac.id'
          };

          if (nim) {
               const student = await db.select().from(users).where(eq(users.nim, nim)).limit(1);
               if (student.length > 0) {
                    const s = student[0];
                    data = {
                         name: s.name || 'Mahasiswa',
                         nim: s.nim,
                         email: s.email || '-'
                    };
               }
          }

          let preview = template;
          Object.keys(data).forEach(key => {
               const regex = new RegExp(`{{${key}}}`, 'g');
               preview = preview.replace(regex, data[key]);
          });

          // Apply same formatting as email sender
          preview = formatEmailHtml(preview);

          res.json({ html: preview });
     } catch (error) {
          console.error('Preview error:', error);
          res.status(500).json({ message: 'Failed to generate preview' });
     }
});

/**
 * @swagger
 * /api/broadcast/send:
 *   post:
 *     summary: Send broadcast email
 *     tags: [Broadcast]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - template
 *             properties:
 *               subject:
 *                 type: string
 *               template:
 *                 type: string
 *               target:
 *                 type: string
 *                 enum: [all, selection]
 *               nims:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Broadcast accepted
 */
router.post('/send', async (req, res) => {
     const { subject, template, target = 'all', nims } = req.body;

     if (!subject || !template) {
          return res.status(400).json({ message: 'Subject and Template are required' });
     }

     try {
          let targets = [];

          // Fetch targets based on selection
          const baseQuery = db.select().from(users).where(eq(users.role, 'voter'));

          if (target === 'selection' && Array.isArray(nims) && nims.length > 0) {
               targets = await db.select().from(users).where(
                    and(
                         eq(users.role, 'voter'),
                         inArray(users.nim, nims)
                    )
               );
          } else {
               // Target ALL active voters (not deleted)
               targets = await baseQuery;
               targets = targets.filter(u => u.deletedAt === null);
          }

          // Filter those with valid emails
          const validTargets = targets.filter(u => u.email && u.email.includes('@'));

          if (validTargets.length === 0) {
               return res.status(400).json({ message: 'No valid recipients found based on criteria.' });
          }

          // Queue jobs
          let queuedCount = 0;
          for (const user of validTargets) {
               if (!user.email) continue;

               await addBroadcastJob(user.email as string, subject, template, {
                    name: user.name || 'Mahasiswa',
                    nim: user.nim,
                    email: user.email || ''
               });
               queuedCount++;
          }

          await logAction(req, 'SEND_BROADCAST', `Subject: ${subject}, Targets: ${queuedCount}`);

          res.json({
               message: 'Broadcast processing started',
               recipientCount: queuedCount,
               skippedCount: targets.length - queuedCount
          });

     } catch (error) {
          console.error('Broadcast error:', error);
          res.status(500).json({ message: 'Failed to process broadcast' });
     }
});

export default router;
