import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export const sendOtpEmail = async (email: string, otp: string, name?: string) => {
    try {
        const info = await transporter.sendMail({
            from: "PEMIRA " + process.env.SMTP_FROM || '"PEMIRA" <no-reply@pemira.sttnf.ac.id>',
            to: email,
            subject: '[PEMIRA] Kode OTP Masuk',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                                <body style="margin: 0; padding: 0; background-color: #f6f9fc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f6f9fc;">
                        <tr>
                            <td align="center" style="padding: 40px 0;">
                                <table border="0" cellpadding="0" cellspacing="0" width="480" style="width: 480px; max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
                        
                                    <!-- Header / Banner -->
                                    <tr>
                                        <td style="background: linear-gradient(135deg, #0248a3 0%, #00337d 100%); padding: 40px 20px; text-align: center;">
                                            <div style="display: inline-block; background-color: white; padding: 12px; border-radius: 12px; margin-bottom: 16px;">
                                                <!-- Using placeholder if no public URL available yet. Ideally this is a hosted image -->
                                                <img src="https://pemira.nurulfikri.ac.id/pemira-logo.png" alt="PEMIRA Logo" style="width: 48px; height: 48px; object-fit: contain; display: block;" onerror="this.style.display='none'">
                                            </div>
                                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">PEMIRA STTNF</h1>
                                        </td>
                                    </tr>

                                    <!-- Content -->
                                    <tr>
                                        <td style="padding: 40px 32px; text-align: left;">
                                            <p style="color: #334155; font-size: 16px; margin-bottom: 24px; line-height: 1.5;">
                                                Halo, <strong>${name || 'Mahasiswa'}</strong>
                                            </p>
                                            <p style="color: #64748b; font-size: 15px; margin-bottom: 32px; line-height: 1.6;">
                                                Kami menerima permintaan untuk masuk ke halaman pemilihan. Gunakan kode OTP di bawah ini untuk melanjutkan:
                                            </p>
                                            
                                            <div style="background-color: #f1f5f9; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px; border: 1px dashed #cbd5e1;">
                                                <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: 700; color: #0f172a; letter-spacing: 8px; display: block;">${otp}</span>
                                            </div>

                                            <p style="color: #64748b; font-size: 14px; margin-bottom: 0; line-height: 1.6;">
                                                Kode ini akan kedaluwarsa dalam <strong>5 menit</strong>.<br>
                                                Jika ini bukan Anda, mohon abaikan email ini.
                                            </p>
                                        </td>
                                    </tr>

                                    <!-- Footer -->
                                    <tr>
                                        <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0;">
                                            <p style="color: #94a3b8; font-size: 13px; margin: 0 0 12px; line-height: 1.5; text-align: center;">
                                                Butuh bantuan? Hubungi kami:
                                            </p>
                                            <div style="text-align: center;">
                                                <a href="https://wa.me/6285156636423" style="display: inline-block; color: #0284c7; text-decoration: none; font-size: 13px; font-weight: 600; margin: 0 8px;">
                                                    📞 +62 851-5663-6423 (Humas)
                                                </a>
                                            </div>
                                            <p style="color: #cbd5e1; font-size: 12px; margin: 24px 0 0; text-align: center;">
                                                &copy; ${new Date().getFullYear()} Panitia PEMIRA STTNF. All rights reserved.
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `,
        });
        console.log('Message sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};
