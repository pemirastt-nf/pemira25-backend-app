import express from 'express';
import { getChatSessions, updateSessionStatus, getChatStats } from '../controllers/chatController';
import { authenticateAdmin, requireOperatorChat } from '../middleware/adminAuth';

const router = express.Router();

// Protected by Admin Guard + Chat Role
router.get('/sessions', authenticateAdmin, requireOperatorChat, getChatSessions);
router.get('/stats', authenticateAdmin, requireOperatorChat, getChatStats);
router.patch('/sessions/:id/status', authenticateAdmin, requireOperatorChat, updateSessionStatus);

export default router;
