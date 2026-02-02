import { Request, Response } from 'express';

import jwt from 'jsonwebtoken';
import { db } from '../config/db';
import { users, otpCodes } from '../db/schema';
import { eq, gt, and, or, isNull } from 'drizzle-orm';
import { sendOtpEmail } from '../config/mail';
import { addOtpEmailJob } from '../queue/emailQueue';
import { checkRateLimit } from '../utils/rateLimiter';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { logAction } from "../utils/actionLogger";

const JWT_SECRET = process.env.JWT_SECRET || 'ea9dd5af6befb4b8b1b9d17d75f0f5afea1f3bde012cc1fa58cc5f926ab355e121ddb710eaaf6684e309d6f906946d8985b8a1ad5be14efc62e2029a9a5f50b0';

export const adminLogin = async (req: Request, res: Response) => {
     const { email, password } = req.body;

     if (!email || !password) {
          return res.status(400).json({ message: 'Email and password required' });
     }

     try {
          const userRes = await db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt)));
          const user = userRes[0];

          if (!user || user.role === 'voter') {
               return res.status(401).json({ message: 'Invalid credentials or access denied' });
          }

          if (!user.password) {
               return res.status(401).json({ message: 'Account not configured for password login.' });
          }

          const validPass = await bcrypt.compare(password, user.password);
          if (!validPass) {
               return res.status(401).json({ message: 'Invalid credentials' });
          }

          const token = jwt.sign(
               { id: user.id, email: user.email, role: user.role, name: user.name },
               JWT_SECRET,
               { expiresIn: '24h' }
          );

          await logAction(req, 'ADMIN_LOGIN', `Admin: ${user.name}`);

          res.cookie('admin_token', token, {
               httpOnly: true,
               secure: true, // Always true for cross-site (None)
               sameSite: 'none', // Required for cross-site (different Vercel domains)
               maxAge: 24 * 60 * 60 * 1000 // 24h
          });

          res.json({
               token,
               user: { id: user.id, email: user.email, role: user.role, name: user.name }
          });

     } catch (error) {
          console.error('Login error', error);
          res.status(500).json({ message: 'Server error' });
     }
};

export const logout = async (req: Request, res: Response) => {
     await logAction(req, 'ADMIN_LOGOUT');
     res.clearCookie('admin_token');
     res.json({ message: 'Logged out' });
};

// Zod Schemas
const RequestOtpSchema = z.object({
     email: z.string().email("Invalid email format").refine(
          (email) => email.endsWith("@student.nurulfikri.ac.id"),
          "Email harus menggunakan domain @student.nurulfikri.ac.id"
     )
});

const VerifyOtpSchema = z.object({
     email: z.string().email("Invalid email format").refine(
          (email) => email.endsWith("@student.nurulfikri.ac.id"),
          "Email harus menggunakan domain @student.nurulfikri.ac.id"
     ),
     otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits")
});

export const requestOtp = async (req: Request, res: Response) => {
     const validation = RequestOtpSchema.safeParse(req.body);

     if (!validation.success) {
          return res.status(400).json({
               message: 'Validation failed',
               errors: validation.error.issues.map(i => i.message)
          });
     }

     const { email } = validation.data;

     try {
          // Check if user exists with this email AND is not deleted
          const userResult = await db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt)));
          const user = userResult[0];

          if (!user) {
               return res.status(404).json({ message: 'Email tidak terdaftar dalam DPT (Daftar Pemilih Tetap)' });
          }

          if (user.hasVoted) {
               return res.status(403).json({ message: 'Anda sudah menggunakan hak pilih anda.' });
          }

          const limitKey = `otp_limit:${email}`;
          const limitCheck = await checkRateLimit(limitKey, 3, 3600);

          if (!limitCheck.allowed) {
               return res.status(429).json({
                    message: 'Batasan request OTP tercapai. Silakan hubungi IT Support.'
               });
          }

          const cooldownKey = `otp_cooldown:${email}`;
          const cooldownCheck = await checkRateLimit(cooldownKey, 1, 60);

          if (!cooldownCheck.allowed) {
               return res.status(429).json({
                    message: `Mohon tunggu ${cooldownCheck.ttl} detik sebelum mengirim ulang.`
               });
          }

          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

          await db.insert(otpCodes).values({
               email,
               code: otp,
               expiresAt,
               createdAt: now
          });

          await addOtpEmailJob(email, otp, user.name || undefined);

          if (process.env.NODE_ENV !== 'production') {
               console.log(`[DEV OTP] To: ${email} | Code: ${otp}`);
          }

          await logAction(req, 'OTP_REQUEST', `Email: ${email}`);
          res.json({ message: 'OTP telah dikirim ke email anda' });
     } catch (error) {
          console.error('Request OTP error:', error);
          res.status(500).json({ message: 'Internal server error' });
     }
};

export const verifyOtp = async (req: Request, res: Response) => {
     const validation = VerifyOtpSchema.safeParse(req.body);

     if (!validation.success) {
          return res.status(400).json({
               message: 'Validation failed',
               errors: validation.error.issues.map(i => i.message)
          });
     }

     const { email, otp } = validation.data;

     try {
          const validOtps = await db.select().from(otpCodes).where(
               and(
                    eq(otpCodes.email, email),
                    eq(otpCodes.code, otp),
                    gt(otpCodes.expiresAt, new Date())
               )
          );

          if (validOtps.length === 0) {
               return res.status(400).json({ message: 'Kode OTP tidak valid atau sudah kadaluarsa' });
          }

          await db.delete(otpCodes).where(eq(otpCodes.email, email));

          const userResult = await db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt)));
          const user = userResult[0];

          if (!user) {
               return res.status(404).json({ message: 'User not found' });
          }

          const token = jwt.sign(
               { id: user.id, nim: user.nim, role: user.role, name: user.name },
               JWT_SECRET,
               { expiresIn: '1h' }
          );

          await logAction(req, 'VOTE_LOGIN', `Voter: ${user.name} (${user.nim})`);

          res.json({
               token,
               user: {
                    id: user.id,
                    nim: user.nim,
                    role: user.role,
                    has_voted: user.hasVoted
               }
          });

     } catch (error) {
          console.error('Verify OTP error:', error);
          res.status(500).json({ message: 'Internal server error' });
     }
};

export const resetOtpLimit = async (req: Request, res: Response) => {
     const ResetSchema = z.object({
          email: z.string().email("Invalid email format")
     });

     const validation = ResetSchema.safeParse(req.body);

     if (!validation.success) {
          return res.status(400).json({
               message: 'Validation failed',
               errors: validation.error.issues.map(i => i.message)
          });
     }

     const { email } = validation.data;

     try {
          await db.delete(otpCodes).where(eq(otpCodes.email, email));

          res.json({ message: `Limit OTP untuk email ${email} berhasil di-reset. User bisa request OTP lagi.` });
          // ...
     } catch (error) {
          console.error('Reset limit error:', error);
          res.status(500).json({ message: 'Internal server error' });
     }
};

export const manualOtpRequest = async (req: Request, res: Response) => {
     const { identifier } = req.body;

     if (!identifier) {
          return res.status(400).json({ message: 'Identifier (Email or NIM) is required' });
     }

     try {
          const userRes = await db.select().from(users).where(
               and(
                    or(eq(users.email, identifier), eq(users.nim, identifier)),
                    isNull(users.deletedAt)
               )
          );

          if (userRes.length === 0) {
               return res.status(404).json({ message: 'Student not found found' });
          }

          const user = userRes[0];
          const email = user.email;

          if (!email) {
               return res.status(400).json({ message: 'Student does not have an email registered' });
          }

          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

          await db.insert(otpCodes).values({
               email,
               code: otp,
               expiresAt
          });

          const emailSent = await sendOtpEmail(email, otp, user.name || undefined);

          await logAction(req, 'MANUAL_OTP', `Target: ${user.name} (${user.nim})`);

          res.json({
               message: `OTP manually triggered for ${user.name} (${email})`,
          });

     } catch (error) {
          console.error('Manual OTP Error:', error);
          res.status(500).json({ message: 'Internal Server Error' });
     }
}

export const me = async (req: Request, res: Response) => {
     const userData = (req as any).user;
     if (!userData) return res.status(401).json({ message: 'Not authenticated' });

     try {
          const userRes = await db.select().from(users).where(eq(users.id, userData.id));
          const user = userRes[0];

          if (!user) {
               return res.status(404).json({ message: 'User not found' });
          }

          res.json({
               id: user.id,
               email: user.email,
               role: user.role,
               name: user.name,
               nim: user.nim
          });
     } catch (error) {
          console.error('Me endpoint error:', error);
          res.status(500).json({ message: 'Server error' });
     }
};

export const seedAdmin = async (req: Request, res: Response) => {
     const email = 'hi@oktaa.my.id';
     const password = 'oktaganteng12';

     try {
          // Check if exists
          const existing = await db.select().from(users).where(eq(users.email, email));
          if (existing.length > 0) {
               const hashed = await bcrypt.hash(password, 10);
               await db.update(users).set({ password: hashed, role: 'super_admin' }).where(eq(users.email, email));
               return res.json({ message: 'Admin seeded (updated)' });
          }

          const hashed = await bcrypt.hash(password, 10);
          await db.insert(users).values({
               nim: 'admin001',
               email,
               name: 'Super Admin',
               role: 'super_admin',
               password: hashed
          });
          res.json({ message: 'Admin seeded successfully. Email: hi@oktaa.my.id, Pass: oktaganteng12' });

     } catch (error) {
          console.error(error);
          res.status(500).json({ message: 'Seed failed', error: (error as Error).message, stack: (error as Error).stack });
     }
};
