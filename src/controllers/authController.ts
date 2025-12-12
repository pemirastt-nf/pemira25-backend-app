import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../config/db';
import { users, otpCodes } from '../db/schema';
import { eq, gt, and } from 'drizzle-orm';
import { sendOtpEmail } from '../config/mail';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me';

export const login = async (req: Request, res: Response) => {
     const { nim, password } = req.body;

     if (!nim || !password) {
          return res.status(400).json({ message: 'NIM and password are required' });
     }

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
     // Basic register for testing purposes
     const { nim, password, role } = req.body;
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
     const { email } = req.body;

     if (!email) {
          return res.status(400).json({ message: 'Email is required' });
     }

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
     const { email, otp } = req.body;

     if (!email || !otp) {
          return res.status(400).json({ message: 'Email and OTP are required' });
     }

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
