import { Router } from 'express';
import { getCandidates, createCandidate, updateCandidate, deleteCandidate, restoreCandidate, permanentDeleteCandidate } from '../controllers/candidateController';
import { authenticateAdmin } from '../middleware/adminAuth';

const router = Router();

router.get('/', getCandidates as any);
router.post('/', authenticateAdmin, createCandidate as any);
router.put('/:id', authenticateAdmin, updateCandidate as any);
router.delete('/:id', authenticateAdmin, deleteCandidate as any);
router.post('/:id/restore', authenticateAdmin, restoreCandidate as any);
router.delete('/:id/permanent', authenticateAdmin, permanentDeleteCandidate as any);

export default router;
