import { Router } from 'express';
import { requestOtp, verifyOtp, resetOtpLimit } from '../controllers/authController';

const router = Router();

router.post('/otp-request', requestOtp as any);
router.post('/otp-verify', verifyOtp as any);
router.post('/reset-otp-limit', resetOtpLimit as any);

export default router;
