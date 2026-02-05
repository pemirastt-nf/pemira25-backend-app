import { Router } from 'express';
import { vote, getVoteStatus, getStats, getResults } from '../controllers/voteController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Votes
 *   description: Voting operations
 */

/**
 * @swagger
 * /api/votes:
 *   post:
 *     summary: Submit a vote
 *     tags: [Votes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - candidateId
 *             properties:
 *               candidateId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Vote submitted
 *       400:
 *         description: Already voted
 */
router.post('/', authenticateToken as any, vote as any);

/**
 * @swagger
 * /api/votes/status:
 *   get:
 *     summary: Get voting status for current user
 *     tags: [Votes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vote status
 */
router.get('/status', authenticateToken as any, getVoteStatus as any);

/**
 * @swagger
 * /api/votes/stats:
 *   get:
 *     summary: Get voting statistics
 *     tags: [Votes]
 *     responses:
 *       200:
 *         description: Voting statistics
 */
router.get('/stats', getStats as any); // Public
router.get('/results', getResults as any); // Public

import { authenticateAdmin, requireSuperAdmin, requireOperatorSuara, requireOperatorTPS } from '../middleware/adminAuth';
import { manualVote, getRecentActivity, deleteVote, checkIn, unCheckIn } from '../controllers/voteController';

// Offline/Manual Vote (Admin Only)
router.post('/checkin', authenticateAdmin, requireOperatorTPS, checkIn as any);
router.post('/uncheckin', authenticateAdmin, requireOperatorTPS, unCheckIn as any);
router.post('/offline', authenticateAdmin, requireOperatorSuara, manualVote as any); // Tally Input (Suara Task)
router.get('/activity', authenticateAdmin, getRecentActivity as any); // Protected (Viewable by any admin? Or limit?) Let's leave for all admins to monitor.
router.delete('/:id', authenticateAdmin, requireSuperAdmin, deleteVote as any); // Super Admin Only, with 1 min check

export default router;
