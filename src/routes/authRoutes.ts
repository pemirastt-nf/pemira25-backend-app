import { Router } from 'express';
import { login, register, requestOtp, verifyOtp, resetOtpLimit } from '../controllers/authController';

const router = Router();


router.post('/login', login as any); // Type assertion to bypass Express specific types issue if strictly typed
router.post('/register', register as any);
router.post('/otp-request', requestOtp as any);
router.post('/otp-verify', verifyOtp as any);
router.post('/reset-otp-limit', resetOtpLimit as any);

export default router;
