import { Router } from 'express';
import { db } from '../config/db';
import { users } from '../db/schema';
import { eq, ilike, or, isNull } from 'drizzle-orm';
import { authenticateAdmin, requireSuperAdmin } from '../middleware/adminAuth';
import { upload } from '../middleware/upload';
import * as XLSX from 'xlsx';
import { logAction } from '../utils/actionLogger';

const router = Router();

// Allow both Super Admin and Panitia for general routes
router.use(authenticateAdmin);

// ... (Import route logic is fine) ...
router.post('/import', upload.single('file'), async (req, res) => {
     // ... import logic ...
     if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
     }

     try {
          const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const data: any[] = XLSX.utils.sheet_to_json(sheet);

          let successCount = 0;
          let errorCount = 0;

          for (const row of data) {
               const nim = row['NIM'] || row['nim'];
               const name = row['Name'] || row['name'];
               const email = row['Email'] || row['email'];

               if (!nim) {
                    errorCount++;
                    continue;
               }

               try {
                    const existing = await db.select().from(users).where(eq(users.nim, String(nim)));

                    if (existing.length > 0) {
                         await db.update(users).set({
                              name: name || existing[0].name,
                              email: email || existing[0].email,
                              deletedAt: null // Restore if re-importing a soft deleted user
                         }).where(eq(users.nim, String(nim)));
                    } else {
                         await db.insert(users).values({
                              nim: String(nim),
                              name: name || '',
                              email: email || null,
                              role: 'voter',
                              hasVoted: false
                         });
                    }
                    successCount++;
               } catch (err) {
                    console.error(`Failed to process NIM ${nim}`, err);
                    errorCount++;
               }
          }

          res.json({
               message: 'Import processed',
               total: data.length,
               success: successCount,
               errors: errorCount
          });

          await logAction(req, 'IMPORT_STUDENTS', `Total: ${data.length}, Success: ${successCount}, Errors: ${errorCount}`);

     } catch (error) {
          console.error('Import error:', error);
          res.status(500).json({ error: 'Failed to process import file' });
     }
});

// Create single student
router.post('/', async (req, res) => {
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
router.get('/', async (req, res) => {
     try {
          const { search, page = 1, limit = 50, includeDeleted } = req.query;
          const offset = (Number(page) - 1) * Number(limit);
          const shouldIncludeDeleted = includeDeleted === 'true';

          // Note: Logic simplified for filtering. 
          // Ideally fetch only non-deleted unless requested
          const allStudents = await db.select().from(users).where(
               eq(users.role, 'voter')
          );

          // Manual filtering + Soft Delete Check
          const filtered = allStudents.filter(u =>
               (shouldIncludeDeleted || u.deletedAt === null) && // Exclude soft deleted unless requested
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

// Mark student as attended
router.post('/mark-attendance', async (req, res) => {
     const { nim } = req.body;
     if (!nim) return res.status(400).json({ message: 'NIM is required' });

     try {
          const userRes = await db.select().from(users).where(eq(users.nim, String(nim)));
          if (userRes.length === 0) return res.status(404).json({ message: 'Student not found' });

          const user = userRes[0];
          if (user.hasVoted) return res.status(400).json({ message: 'Student is already marked as voted' });
          if (user.deletedAt) return res.status(400).json({ message: 'Student is deleted' });

          await db.update(users)
               .set({ hasVoted: true, votedAt: new Date() })
               .where(eq(users.id, user.id));

          res.json({ message: `Student ${nim} marked as present/voted` });
     } catch (error) {
          res.status(500).json({ message: 'Failed to mark attendance' });
     }
});

// Soft Delete Student (Super Admin Only)
router.delete('/:id', requireSuperAdmin, async (req, res) => {
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
router.post('/:id/restore', requireSuperAdmin, async (req, res) => {
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
router.delete('/:id/permanent', requireSuperAdmin, async (req, res) => {
     const { id } = req.params;
     try {
          await db.delete(users).where(eq(users.id, id));
          res.json({ message: 'Student deleted permanently' });
          await logAction(req, 'PERMANENT_DELETE_STUDENT', `ID: ${id}`);
     } catch (error) {
          console.error('Permanent delete error', error);
          res.status(500).json({ message: 'Failed to permanently delete student' });
     }
});

export default router;
