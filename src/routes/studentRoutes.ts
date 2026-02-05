import { Router, Request, Response } from 'express';
import { db } from '../config/db';
import { users, offlineVoteLogs } from '../db/schema';
import { eq, or, desc, sql, inArray, ilike, and, isNull } from 'drizzle-orm';
import { authenticateToken } from '../middleware/authMiddleware';
import { authenticateAdmin, requireSuperAdmin, requireOperatorTPS } from '../middleware/adminAuth';
import multer from 'multer';
import { upload } from '../middleware/upload';
import * as XLSX from 'xlsx';
import { logAction } from '../utils/actionLogger';

// Helper: Title Case
function toTitleCase(str: string) {
     return str.replace(
          /\w\S*/g,
          text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
     );
}

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Students
 *   description: Student management
 */

// Allow both Super Admin and Panitia for general routes
router.use(authenticateAdmin);


/**
 * @swagger
 * /api/students/import:
 *   post:
 *     summary: Import students from Excel
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Students imported
 */
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
     try {
          let data: any[] = [];

          if (req.body.students && Array.isArray(req.body.students)) {
               data = req.body.students;
          }
          else if (req.file) {
               const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
               const sheetName = workbook.SheetNames[0];
               const sheet = workbook.Sheets[sheetName];
               data = XLSX.utils.sheet_to_json(sheet);
          }
          else {
               return res.status(400).json({ error: 'No data provided. Please upload a file or send JSON data.' });
          }

          let successCount = 0;
          let errorCount = 0;




          for (const row of data) {
               const rawNim = row['NIM'] || row['nim'] || row['Nim'];
               const rawName = row['Name'] || row['name'] || row['Nama'] || row['nama'];
               const rawEmail = row['Email'] || row['email'];
               const rawBatch = row['Batch'] || row['batch'] || row['Angkatan'] || row['angkatan'];

               if (!rawNim || !rawName) {
                    errorCount++;
                    continue;
               }

               const normalizedNim = String(rawNim).trim();
               const normalizedName = toTitleCase(String(rawName).trim());
               const normalizedBatch = rawBatch ? String(rawBatch).trim() : null;
               const normalizedEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : null;

               const batchConfig = req.body.batchConfig || {};
               let accessType = 'online';

               if (normalizedBatch && batchConfig[normalizedBatch]) {
                    accessType = batchConfig[normalizedBatch];
               }

               try {
                    const existingByNim = await db.select().from(users).where(eq(users.nim, normalizedNim));

                    if (existingByNim.length > 0) {
                         await db.update(users).set({
                              name: normalizedName,
                              email: normalizedEmail || existingByNim[0].email,
                              batch: normalizedBatch || existingByNim[0].batch,
                              accessType: accessType,
                              deletedAt: null
                         }).where(eq(users.nim, normalizedNim));
                    } else {
                         const existingByName = await db.select().from(users).where(ilike(users.name, normalizedName));

                         let shouldCreateNew = true;

                         if (existingByName.length === 1) {
                              const targetUser = existingByName[0];
                              const nameParts = normalizedName.split(' ');
                              if (nameParts.length > 1) {
                                   await db.update(users).set({
                                        nim: normalizedNim,
                                        email: normalizedEmail || targetUser.email,
                                        batch: normalizedBatch || targetUser.batch,
                                        deletedAt: null
                                   }).where(eq(users.id, targetUser.id));

                                   shouldCreateNew = false;
                              }
                         }

                         if (shouldCreateNew) {
                              await db.insert(users).values({
                                   nim: normalizedNim,
                                   name: normalizedName,
                                   email: normalizedEmail || null,
                                   batch: normalizedBatch,
                                   role: 'voter',
                                   accessType: accessType,
                                   hasVoted: false
                              });
                         }
                    }
                    successCount++;
               } catch (err) {
                    console.error(`Failed to process NIM ${normalizedNim}`, err);
                    errorCount++;
               }
          }

          res.json({
               message: 'Import processed successfully',
               total: data.length,
               success: successCount,
               errors: errorCount
          });

          await logAction(req, 'IMPORT_STUDENTS', `Total: ${data.length}, Success: ${successCount}, Errors: ${errorCount}`);

     } catch (error) {
          console.error('Import error:', error);
          res.status(500).json({ error: 'Failed to process import data' });
     }
});

// Create single student
/**
 * @swagger
 * /api/students:
 *   post:
 *     summary: Create a new student (Admin only)
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nim
 *               - name
 *             properties:
 *               nim:
 *                 type: string
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       201:
 *         description: Student created
 *       400:
 *         description: Invalid input or student already exists
 */
router.post('/', async (req: Request, res: Response) => {
     const { nim, name, email } = req.body;

     if (!nim || !name) {
          return res.status(400).json({ message: 'NIM and Name are required' });
     }

     try {
          // Check existing
          const existing = await db.select().from(users).where(eq(users.nim, String(nim)));

          if (existing.length > 0) {
               return res.status(400).json({ message: 'Mahasiswa dengan NIM tersebut sudah ada (mungkin terhapus/soft deleted).' });
          }

          await db.insert(users).values({
               nim: String(nim),
               name,
               email: email || null,
               batch: req.body.batch || null, // Optional batch
               role: 'voter',
               hasVoted: false
          });

          res.status(201).json({ message: 'Mahasiswa berhasil ditambahkan' });

          await logAction(req, 'CREATE_STUDENT', `NIM: ${nim}, Name: ${name}`);
     } catch (error) {
          console.error('Create student error:', error);
          res.status(500).json({ message: 'Gagal menambahkan mahasiswa' });
     }
});

// Import students from Excel

// Get students (voters)
/**
 * @swagger
 * /api/students:
 *   get:
 *     summary: Get all students
 *     tags: [Students]
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
 *     responses:
 *       200:
 *         description: List of students
 */
router.get('/', async (req: Request, res: Response) => {
     try {
          const { search, page = 1, limit = 50, includeDeleted, includeAllRoles, accessType } = req.query;
          const offset = (Number(page) - 1) * Number(limit);
          const shouldIncludeDeleted = includeDeleted === 'true';
          const shouldIncludeAllRoles = includeAllRoles === 'true';

          const allStudents = await db.select().from(users).where(
               and(
                    shouldIncludeAllRoles ? undefined : eq(users.role, 'voter'),
                    shouldIncludeDeleted ? undefined : isNull(users.deletedAt),
                    accessType ? eq(users.accessType, String(accessType)) : undefined
               )
          );

          // Manual filtering for Search
          const filtered = allStudents.filter((u: typeof users.$inferSelect) =>
          (
               !search ||
               u.name?.toLowerCase().includes(String(search).toLowerCase()) ||
               u.nim?.toLowerCase().includes(String(search).toLowerCase()) ||
               u.email?.toLowerCase().includes(String(search).toLowerCase())
          )
          );

          const paginated = filtered.slice(offset, offset + Number(limit));

          res.json({
               data: paginated,
               total: filtered.length,
               page: Number(page),
               totalPages: Math.ceil(filtered.length / Number(limit))
          });
     } catch (error) {
          console.error('Error fetching students:', error);
          res.status(500).json({ error: 'Internal Server Error' });
     }
});

// Update Student (Super Admin & Panitia)
/**
 * @swagger
 * /api/students/{id}:
 *   put:
 *     summary: Update student details
 *     tags: [Students]
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
 *               nim:
 *                 type: string
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               batch:
 *                 type: string
 *     responses:
 *       200:
 *         description: Student updated
 *       404:
 *         description: Student not found
 */
router.put('/:id', async (req: Request, res: Response) => {
     const { id } = req.params;
     const { nim, name, email, batch } = req.body;

     try {
          // Check if student exists
          const existing = await db.select().from(users).where(eq(users.id, id));
          if (existing.length === 0) {
               return res.status(404).json({ message: 'Mahasiswa tidak ditemukan' });
          }

          // If NIM is changed, check for conflict
          if (nim && nim !== existing[0].nim) {
               const conflict = await db.select().from(users).where(eq(users.nim, String(nim)));
               if (conflict.length > 0) {
                    return res.status(400).json({ message: 'NIM sudah digunakan oleh mahasiswa lain' });
               }
          }

          await db.update(users)
               .set({
                    nim: nim || existing[0].nim,
                    name: name || existing[0].name,
                    email: email !== undefined ? email : existing[0].email, // Allow clearing email if sent as null/empty
                    batch: batch !== undefined ? batch : existing[0].batch,
                    accessType: req.body.accessType || existing[0].accessType // Allow manual edit of Access Type
               })
               .where(eq(users.id, id));

          res.json({ message: 'Data mahasiswa berhasil diperbarui' });
          await logAction(req, 'UPDATE_STUDENT', `ID: ${id}, Updates: ${JSON.stringify({ nim, name, email, batch, accessType: req.body.accessType })}`);

     } catch (error) {
          console.error('Update student error:', error);
          res.status(500).json({ message: 'Gagal memperbarui data mahasiswa' });
     }
});

// Mark student as attended
router.post('/mark-attendance', authenticateAdmin, requireOperatorTPS, async (req: Request, res: Response) => {
     res.status(410).json({ message: "Deprecated. Use /votes/checkin" });
});

// Soft Delete Student (Super Admin Only)
router.delete('/:id', authenticateAdmin, requireSuperAdmin, async (req: Request, res: Response) => {
     const { id } = req.params;
     try {
          await db.update(users)
               .set({ deletedAt: new Date() })
               .where(eq(users.id, id));

          res.json({ message: 'Student deleted (soft)' });
          await logAction(req, 'DELETE_STUDENT', `ID: ${id}`);
     } catch (error) {
          console.error('Delete error', error);
          res.status(500).json({ message: 'Failed to delete student' });
     }
});

// Restore Student (Super Admin Only)
router.post('/:id/restore', requireSuperAdmin, async (req: Request, res: Response) => {
     const { id } = req.params;
     try {
          await db.update(users)
               .set({ deletedAt: null })
               .where(eq(users.id, id));

          res.json({ message: 'Student restored successfully' });
          await logAction(req, 'RESTORE_STUDENT', `ID: ${id}`);
     } catch (error) {
          console.error('Restore error', error);
          res.status(500).json({ message: 'Failed to restore student' });
     }
});

// Permanent Delete Student (Super Admin Only)
router.delete('/:id/permanent', requireSuperAdmin, async (req: Request, res: Response) => {
     const { id } = req.params;
     try {
          // Fix FK Constraint: Nullify inputBy in offlineVoteLogs before hard delete
          await db.update(offlineVoteLogs)
               .set({ inputBy: null })
               .where(eq(offlineVoteLogs.inputBy, id));

          await db.delete(users).where(eq(users.id, id));
          res.json({ message: 'Student deleted permanently' });
          await logAction(req, 'PERMANENT_DELETE_STUDENT', `ID: ${id}`);
     } catch (error) {
          console.error('Permanent delete error', error);
          res.status(500).json({ message: 'Failed to permanently delete student' });
     }
});

export default router;
