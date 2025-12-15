import { Request, Response } from 'express';
import { db } from '../config/db';
import { candidates, votes, users } from '../db/schema';
import { asc, eq, inArray, isNull } from 'drizzle-orm';
import { logAction } from '../utils/actionLogger';

export const getCandidates = async (req: Request, res: Response) => {
     try {
          const { includeDeleted } = req.query;
          const shouldIncludeDeleted = includeDeleted === 'true';

          let query = db.select().from(candidates).$dynamic();

          if (!shouldIncludeDeleted) {
               query = query.where(isNull(candidates.deletedAt));
          }

          const result = await query.orderBy(asc(candidates.orderNumber));
          res.json(result);
     } catch (error) {
          console.error('Error fetching candidates:', error);
          res.status(500).json({ message: 'Internal server error' });
     }
};

export const createCandidate = async (req: Request, res: Response) => {
     const { name, vision, mission, orderNumber, photoUrl } = req.body;

     try {
          await db.insert(candidates).values({
               name,
               vision,
               mission,
               orderNumber: Number(orderNumber),
               photoUrl
          });
          res.status(201).json({ message: 'Candidate created successfully' });
          await logAction(req, 'CREATE_CANDIDATE', `Name: ${name}, Order: ${orderNumber}`);
     } catch (error) {
          console.error('Create candidate error:', error);
          res.status(500).json({ message: 'Failed to create candidate' });
     }
};

export const updateCandidate = async (req: Request, res: Response) => {
     const { id } = req.params;
     const { name, vision, mission, orderNumber, photoUrl } = req.body;

     try {
          await db.update(candidates)
               .set({ name, vision, mission, orderNumber: Number(orderNumber), photoUrl })
               .where(eq(candidates.id, id));
          res.json({ message: 'Candidate updated successfully' });
          await logAction(req, 'UPDATE_CANDIDATE', `ID: ${id}, Name: ${name}`);
     } catch (error) {
          console.error('Update candidate error:', error);
          res.status(500).json({ message: 'Failed to update candidate' });
     }
};

export const deleteCandidate = async (req: Request, res: Response) => {
     const { id } = req.params;
     try {
          // Soft Delete: Mark as deleted to allow recovery/safety
          await db.update(candidates)
               .set({ deletedAt: new Date() })
               .where(eq(candidates.id, id));

          res.json({ message: 'Candidate deleted (Soft)' });
          await logAction(req, 'DELETE_CANDIDATE', `ID: ${id}`);
     } catch (error) {
          console.error('Delete candidate error:', error);
          res.status(500).json({ message: 'Failed to delete candidate' });
     }
};

export const restoreCandidate = async (req: Request, res: Response) => {
     const { id } = req.params;
     try {
          await db.update(candidates)
               .set({ deletedAt: null })
               .where(eq(candidates.id, id));
          res.json({ message: 'Candidate restored' });
          await logAction(req, 'RESTORE_CANDIDATE', `ID: ${id}`);
     } catch (error) {
          console.error('Restore candidate error:', error);
          res.status(500).json({ message: 'Failed to restore candidate' });
     }
};

export const permanentDeleteCandidate = async (req: Request, res: Response) => {
     const { id } = req.params;
     try {
          await db.delete(candidates).where(eq(candidates.id, id));
          res.json({ message: 'Candidate permanently deleted' });
          await logAction(req, 'PERMANENT_DELETE_CANDIDATE', `ID: ${id}`);
     } catch (error) {
          console.error('Permanent delete candidate error:', error);
          res.status(500).json({ message: 'Failed to permanently delete candidate' });
     }
};
