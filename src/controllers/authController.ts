import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../config/db';
import { users, otpCodes } from '../db/schema';
import { eq, gt, and } from 'drizzle-orm';
import { sendOtpEmail } from '../config/mail';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me';

// Zod Schemas
const LoginSchema = z.object({
     nim: z.string().min(1, "NIM is required"),
     password: z.string().min(1, "Password is required")
});

const RequestOtpSchema = z.object({
     email: z.string().email("Invalid email format")
});

const VerifyOtpSchema = z.object({
     email: z.string().email("Invalid email format"),
     otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits")
});

// Registration schema (for testing/future use)
const RegisterSchema = z.object({
     nim: z.string().min(1, "NIM is required"),
     password: z.string().min(6, "Password must be at least 6 characters"),
     role: z.enum(['admin', 'voter']).optional()
});

export const login = async (req: Request, res: Response) => {
     const validation = LoginSchema.safeParse(req.body);

     if (!validation.success) {
          return res.status(400).json({
               message: 'Validation failed',
               errors: validation.error.issues.map(i => i.message)
          });
     }

     const { nim, password } = validation.data;

     try {
          const userResult = await db.select().from(users).where(eq(users.nim, nim));
          const user = userResult[0];

          if (!user) {
               return res.status(401).json({ message: 'Invalid credentials' });
          }

          const validPassword = await bcrypt.compare(password, user.passwordHash);
          if (!validPassword) {
               return res.status(401).json({ message: 'Invalid credentials' });
          }

          const token = jwt.sign(
               { id: user.id, nim: user.nim, role: user.role },
               JWT_SECRET,
               { expiresIn: '1h' }
          );

          res.json({ token, user: { id: user.id, nim: user.nim, role: user.role, has_voted: user.hasVoted } });
     } catch (error) {
          console.error('Login error:', error);
          res.status(500).json({ message: 'Internal server error' });
     }
};

export const register = async (req: Request, res: Response) => {
     const validation = RegisterSchema.safeParse(req.body);

     if (!validation.success) {
          return res.status(400).json({
               message: 'Validation failed',
               errors: validation.error.issues.map(i => i.message)
          });
     }

     const { nim, password, role } = validation.data;

     try {
          const hashedPassword = await bcrypt.hash(password, 10);
          const result = await db.insert(users).values({
               nim,
               passwordHash: hashedPassword,
               role: role || 'voter'
          }).returning({ id: users.id, nim: users.nim });

          res.status(201).json(result[0]);
     } catch (error) {
          console.error('Register error:', error);
          res.status(500).json({ message: 'Error registering user' });
     }
}

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
          // Check if user exists with this email
          const userResult = await db.select().from(users).where(eq(users.email, email));
          const user = userResult[0];

          if (!user) {
               return res.status(404).json({ message: 'Email tidak terdaftar dalam DPT (Daftar Pemilih Tetap)' });
          }

          if (user.hasVoted) {
               return res.status(403).json({ message: 'Anda sudah menggunakan hak pilih anda.' });
          }

          // Rate Limiting Logic
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const recentOtps = await db.select().from(otpCodes).where(
               and(
                    eq(otpCodes.email, email),
                    gt(otpCodes.createdAt, oneHourAgo)
               )
          );

          // 1. Strict Limit Check (Max 3 requests per hour)
          if (recentOtps.length >= 3) {
               return res.status(429).json({
                    message: 'Batasan request OTP tercapai. Silakan hubungi IT Support.'
               });
          }

          // 2. Cooldown Check (60 seconds)
          if (recentOtps.length > 0) {
               // Get the latest OTP
               const latestOtp = recentOtps.sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime())[0];
               const timeDiff = Date.now() - latestOtp.createdAt!.getTime();

               if (timeDiff < 60000) {
                    const remainingSeconds = Math.ceil((60000 - timeDiff) / 1000);
                    return res.status(429).json({
                         message: `Mohon tunggu ${remainingSeconds} detik sebelum mengirim ulang.`
                    });
               }
          }

          // Generate OTP
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

          // Save OTP to DB
          await db.insert(otpCodes).values({
               email,
               code: otp,
               expiresAt
          });

          // Send Email
          const emailSent = await sendOtpEmail(email, otp, user.name || undefined);

          if (!emailSent) {
               console.log(`[DEV ONLY] OTP for ${email}: ${otp}`);
          }

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
          // Find valid OTP
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

          // Invalidate OTP (delete it)
          await db.delete(otpCodes).where(eq(otpCodes.email, email));

          // Get User - we know they exist from requestOtp, but let's be safe
          const userResult = await db.select().from(users).where(eq(users.email, email));
          const user = userResult[0];

          if (!user) {
               return res.status(404).json({ message: 'User not found' });
          }

          // Generate Token
          const token = jwt.sign(
               { id: user.id, nim: user.nim, role: user.role },
               JWT_SECRET,
               { expiresIn: '1h' }
          );

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
          // Delete all OTP history for this email
          await db.delete(otpCodes).where(eq(otpCodes.email, email));

          res.json({ message: `Limit OTP untuk email ${email} berhasil di-reset. User bisa request OTP lagi.` });
     } catch (error) {
          console.error('Reset limit error:', error);
          res.status(500).json({ message: 'Internal server error' });
     }
};
