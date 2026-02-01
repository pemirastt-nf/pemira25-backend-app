import { Router } from 'express';
import { db } from '../config/db';
import { users, broadcasts } from '../db/schema';
import { eq, inArray, and, isNull, desc } from 'drizzle-orm';
import { authenticateAdmin } from '../middleware/adminAuth';
import { addBroadcastJob } from '../queue/emailQueue';
import { logAction } from '../utils/actionLogger';
import { formatEmailHtml, wrapEmailBody, getButtonHtml } from '../config/mail';

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
 *               cta_text:
 *                 type: string
 *               cta_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Preview HTML
 */
router.post('/preview', async (req, res) => {
     const { template, nim, cta_text, cta_url } = req.body;

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

          // CTA Logic (Parameterized)
          // Pattern: {{cta_button|TEXT|URL}}
          const ctaRegex = /{{cta_button\|(.*?)\|(.*?)}}/g;
          preview = preview.replace(ctaRegex, (_: string, text: string, url: string) => getButtonHtml(text, url));

          // Legacy Fallback (if user still has {{cta_button}} in content but no params, ignore it or handle?)
          // For now, let's just support the new format strictly as agreed.
          // If we want to support global CTA again, we'd need that data back.
          // Assuming cleanup phase removes global CTA logic completely.

          // Apply same formatting as email sender
          // Use CID=false for preview so browser can load image from URL
          preview = wrapEmailBody(preview, false);

          res.json({ html: preview });
     } catch (error) {
          console.error('Preview error:', error);
          res.status(500).json({ message: 'Failed to generate preview' });
     }
});

/**
 * @swagger
 * /api/broadcast/send:
 *   // ... (existing swagger)
 */
// ... (existing batches, list, detail, draft, update, delete endpoints)

// ...

// --- TEST SEND (To Admin) ---
router.post('/test-send', async (req, res) => {
     const { subject, template, email, cta_text, cta_url } = req.body;
     if (!email || !subject || !template) return res.status(400).json({ message: 'Missing required fields' });

     try {
          let content = template.replace('{{name}}', 'Admin (Test)').replace('{{nim}}', '00000').replace('{{email}}', email);

          // CTA Logic (Parameterized)
          const ctaRegex = /{{cta_button\|(.*?)\|(.*?)}}/g;
          content = content.replace(ctaRegex, (_: string, text: string, url: string) => getButtonHtml(text, url));

          const html = wrapEmailBody(content);

          // Import sendEmail dynamically or use top-level if available
          const { sendEmail } = await import('../config/mail');

          const success = await sendEmail(email, `[TEST] ${subject}`, html);

          if (success) res.json({ message: 'Test email sent' });
          else res.status(500).json({ message: 'Failed to send test email' });

     } catch (error) {
          console.error('Test send error:', error);
          res.status(500).json({ message: 'Failed to send test email' });
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
// --- HELPER: Get District Batches ---
router.get('/batches', async (req, res) => {
     try {
          const result = await db.selectDistinct({ batch: users.batch }).from(users).where(and(eq(users.role, 'voter'), isNull(users.deletedAt))).orderBy(users.batch);
          const batches = result.map(r => r.batch).filter(b => b !== null);
          res.json(batches);
     } catch (error) {
          console.error('Fetch batches error:', error);
          res.status(500).json({ message: 'Failed to fetch batches' });
     }
});

// --- LIST BROADCASTS ---
router.get('/', async (req, res) => {
     try {
          // TODO: Add pagination if needed
          const result = await db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt));
          res.json(result);
     } catch (error) {
          console.error('List broadcasts error:', error);
          res.status(500).json({ message: 'Failed to fetch broadcasts' });
     }
});

// --- GET BROADCAST DETAIL ---
router.get('/:id', async (req, res) => {
     try {
          const result = await db.select().from(broadcasts).where(eq(broadcasts.id, req.params.id));
          if (result.length === 0) return res.status(404).json({ message: 'Broadcast not found' });
          res.json(result[0]);
     } catch (error) {
          console.error('Get broadcast error:', error);
          res.status(500).json({ message: 'Failed to fetch broadcast' });
     }
});

// --- CREATE DRAFT ---
router.post('/draft', async (req, res) => {
     const { subject, template, filters, cta_text, cta_url } = req.body;
     try {
          const filtersWithCta = {
               ...(filters || { target: 'all' }),
               cta: { text: cta_text || '', url: cta_url || '' }
          };

          const result = await db.insert(broadcasts).values({
               subject: subject || 'Untitled Draft',
               content: template || '',
               filters: filtersWithCta,
               status: 'draft',
               createdBy: (req as any).user?.id // Assuming adminAuth populates req.user
          }).returning();
          res.json(result[0]);
     } catch (error) {
          console.error('Create draft error:', error);
          res.status(500).json({ message: 'Failed to create draft' });
     }
});

// --- UPDATE DRAFT ---
router.put('/:id', async (req, res) => {
     const { subject, template, filters, cta_text, cta_url } = req.body;
     try {
          const [existing] = await db.select().from(broadcasts).where(eq(broadcasts.id, req.params.id));
          if (!existing) return res.status(404).json({ message: 'Broadcast not found' });

          if (existing.status !== 'draft') {
               return res.status(400).json({ message: 'Only drafts can be edited' });
          }

          const filtersWithCta = {
               ...(filters || existing.filters || { target: 'all' }),
               cta: { text: cta_text || '', url: cta_url || '' }
          };

          const result = await db.update(broadcasts).set({
               subject,
               content: template,
               filters: filtersWithCta,
               updatedAt: new Date(),
          }).where(eq(broadcasts.id, req.params.id)).returning();

          res.json(result[0]);
     } catch (error) {
          console.error('Update draft error:', error);
          res.status(500).json({ message: 'Failed to update draft' });
     }
});

// --- DELETE BROADCAST ---
router.delete('/:id', async (req, res) => {
     try {
          await db.delete(broadcasts).where(eq(broadcasts.id, req.params.id));
          res.json({ message: 'Broadcast deleted' });
     } catch (error) {
          console.error('Delete broadcast error:', error);
          res.status(500).json({ message: 'Failed to delete broadcast' });
     }
});

// --- PUBLISH / SEND BROADCAST ---
router.post('/:id/publish', async (req, res) => {
     try {
          const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, req.params.id));
          if (!broadcast) return res.status(404).json({ message: 'Broadcast not found' });

          if (broadcast.status === 'processing' || broadcast.status === 'completed') {
               return res.status(400).json({ message: 'Broadcast already sent or processing' });
          }

          const { subject, content, filters } = broadcast;
          const filterData = filters as { target: string; batches?: string[]; cta?: { text: string; url: string } } || { target: 'all' };
          const ctaData = filterData.cta || { text: '', url: '' };

          // Determine Targets
          let query = db.select().from(users).where(and(eq(users.role, 'voter'), isNull(users.deletedAt)));

          let targets = await query;
          // Filter Deleted - Handled in SQL now
          // targets = targets.filter(u => u.deletedAt === null);

          // Filter by Batch
          if (filterData.target === 'batch' && filterData.batches && filterData.batches.length > 0) {
               targets = targets.filter(u => filterData.batches!.includes(u.batch || ''));
          }

          // Filter by Unvoted
          if (filterData.target === 'unvoted') {
               targets = targets.filter(u => !u.hasVoted);
          }

          // Validation
          const validTargets = targets.filter(u => u.email && u.email.includes('@'));

          if (validTargets.length === 0) {
               return res.status(400).json({ message: 'No valid recipients found for this criteria.' });
          }

          // Queue Jobs
          let queuedCount = 0;
          for (const user of validTargets) {
               if (!user.email) continue;
               await addBroadcastJob(user.email, subject, content, {
                    name: user.name || 'Mahasiswa',
                    nim: user.nim,
                    email: user.email
               }, ctaData.text, ctaData.url);
               queuedCount++;
          }

          // Update Status
          await db.update(broadcasts).set({
               status: 'completed', // Or 'processing' if we want detailed tracking later
               stats: { total: validTargets.length, sent: queuedCount, failed: 0 },
               updatedAt: new Date()
          }).where(eq(broadcasts.id, req.params.id));

          await logAction(req, 'PUBLISH_BROADCAST', `ID: ${broadcast.id}, Targets: ${queuedCount}`);

          res.json({
               message: 'Broadcast published successfully',
               recipientCount: queuedCount
          });

     } catch (error) {
          console.error('Publish broadcast error:', error);
          res.status(500).json({ message: 'Failed to publish broadcast' });
     }
});

// --- TEST SEND (To Admin) ---
router.post('/test-send', async (req, res) => {
     const { subject, template, email } = req.body;
     if (!email || !subject || !template) return res.status(400).json({ message: 'Missing required fields' });

     try {
          // Use wrapEmailBody via helper if needed, but worker handles it. 
          // Actually worker handles it if we use addBroadcastJob. 
          // For direct test without queue: use sendEmail directly + wrapEmailBody.

          const html = wrapEmailBody(template.replace('{{name}}', 'Admin (Test)').replace('{{nim}}', '00000').replace('{{email}}', email));

          // We can use the helper sendEmail directly here to be instantaneous
          // Import sendEmail from config/mail first
          const { sendEmail } = await import('../config/mail'); // Dynamic import or top level

          const success = await sendEmail(email, `[TEST] ${subject}`, html);

          if (success) res.json({ message: 'Test email sent' });
          else res.status(500).json({ message: 'Failed to send test email' });

     } catch (error) {
          console.error('Test send error:', error);
          res.status(500).json({ message: 'Failed to send test email' });
     }
});

export default router;
