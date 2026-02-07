import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const smtpUser = process.env.SMTP_USER;
const smtpPassword = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

if (!smtpUser || !smtpPassword) {
  console.warn("⚠️ SMTP Credentials (SMTP_USER or SMTP_PASSWORD/SMTP_PASS) are missing. Email sending will likely fail.");
}

// Primary Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: smtpUser,
    pass: smtpPassword,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

// Backup Transporter (Optional)
let backupTransporter: nodemailer.Transporter | null = null;
if (process.env.BACKUP_SMTP_HOST && process.env.BACKUP_SMTP_USER) {
  backupTransporter = nodemailer.createTransport({
    host: process.env.BACKUP_SMTP_HOST,
    port: parseInt(process.env.BACKUP_SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.BACKUP_SMTP_USER,
      pass: process.env.BACKUP_SMTP_PASS,
    },
    pool: true,
    maxConnections: 3,
  });
  console.log("✅ Backup SMTP Configured");
}

// Helper to format email with default styles
export const formatEmailHtml = (html: string) => {
  // Simple heuristic: if it doesn't have a body tag, wrap it for styling
  const hasBody = html.includes('<body');
  const finalHtml = hasBody ? html : `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 20px; background-color: #ffffff; color: #000000; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            <div style="color: #000000; line-height: 1.6;">
                ${html}
            </div>
        </body>
        </html>
    `;
  return finalHtml;
};

// Generic send email function with Fallback
export const sendEmail = async (to: string, subject: string, html: string, attachments: any[] = []) => {
  // SAFETY: If MAIL_DRY_RUN is true (default in dev if not specified otherwise), don't send real emails.
  const isDryRun = process.env.MAIL_DRY_RUN === 'true'; // Set this in .env if needed

  if (isDryRun) {
    console.log(`[MAIL DRY RUN] Would send to: ${to} | Subject: ${subject}`);
    return true; // Pretend success
  }

  try {
    const finalHtml = formatEmailHtml(html);
    const mailOptions = {
      from: process.env.SMTP_FROM || `"PEMIRA STTNF" <${process.env.SMTP_USER || 'no-reply@pemira.nurulfikri.ac.id'}>`,
      to,
      subject,
      html: finalHtml,
      attachments: attachments
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('Message sent (Primary): %s', info.messageId);
      return true;
    } catch (primaryError) {
      console.error('⚠️ Primary SMTP failed:', primaryError);

      if (backupTransporter) {
        console.log('🔄 Attempting Backup SMTP...');
        const info = await backupTransporter.sendMail(mailOptions);
        console.log('Message sent (Backup): %s', info.messageId);
        return true;
      } else {
        throw primaryError; // Re-throw if no backup
      }
    }
  } catch (error) {
    console.error('❌ Error sending email (All transporters failed):', error);
    return false;
  }
};

// Standard Email Template Wrapper
export const wrapEmailBody = (content: string, useCid = false) => {
  const logoSrc = 'https://cdn.pemira.oktaa.my.id/pemira-logo.png';

  return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>

        <body style="margin:0;padding:0;background-color:#f6f9fc;color:#0f172a;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f9fc;">
            <tr>
              <td align="center" style="padding:40px 0;">

                <!-- Card -->
                <table width="480" cellpadding="0" cellspacing="0"
                  style="
                    width:480px;
                    max-width:480px;
                    background-color:#ffffff;
                    border-radius:16px;
                    overflow:hidden;
                    box-shadow:0 10px 30px rgba(15,23,42,0.08);
                  ">

                  <!-- ================= HEADER ================= -->
                  <tr>
          <td style="padding:32px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <!-- Logo -->
                <td valign="middle" style="padding-right:14px;">
                  <img
                    src="${logoSrc}"
                    alt="PEMIRA Logo"
                    style="height:52px;width:auto;display:block;"
                  >
                </td>

                <!-- Name -->
                <td valign="middle">
                  <p
                    style="
                      margin:0;
                      font-size:20px;
                      font-weight:1000;
                      letter-spacing:0.6px;
                      color:#023e84;
                      text-transform:uppercase;
                    "
                  >
                    PEMIRA IM STTNF
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>


                  <!-- ================= CONTENT ================= -->
                  <tr>
                    <td align="left" style="padding:0 32px 28px 32px;">
                      <div
                        style="
                          margin:0;
                          font-size:16px;
                          line-height:1.75;
                          color:#334155;
                        "
                      >
                        ${content}
                      </div>
                    </td>
                  </tr>

                  <!-- ================= DIVIDER ================= -->
                  <tr>
                    <td style="padding:0 32px;">
                      <div style="height:1px;background-color:#e2e8f0;width:100%;"></div>
                    </td>
                  </tr>

                  <!-- ================= FOOTER ================= -->
                  <tr>
                    <td align="center" style="padding:20px 32px 28px 32px;">
                      <p
                        style="
                          margin:0 0 10px 0;
                          font-size:14px;
                          color:#475569;
                        "
                      >
                        Butuh bantuan? Chat support di
                        <a
                          href="${process.env.FRONTEND_URL || 'https://pemira.nurulfikri.ac.id'}"
                          style="
                            color:#0284c7;
                            text-decoration:none;
                            font-weight:600;
                          "
                        >
                          Website PEMIRA
                        </a>
                      </p>

                      <p
                        style="
                          margin:0;
                          font-size:12px;
                          color:#94a3b8;
                        "
                      >
                        &copy; ${new Date().getFullYear()} PEMIRA IM STTNF. All rights reserved.
                      </p>
                    </td>
                  </tr>

                </table>
                <!-- End Card -->

              </td>
            </tr>
          </table>
        </body>
        </html>
    `;
};

export const getButtonHtml = (text: string, url: string) => {
  return `
        <!-- Button -->
        <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td
                    align="center"
                    bgcolor="#0248a3"
                    style="border-radius: 12px; background: linear-gradient(135deg, #0248a3 0%, #00337d 100%);"
                  >
                    <a
                      href="${url}"
                      target="_blank"
                      style="
                        display: inline-block;
                        padding: 14px 32px;
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        font-size: 16px;
                        font-weight: 600;
                        color: #ffffff;
                        text-decoration: none;
                        border-radius: 12px;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        mso-padding-alt: 0;
                        text-align: center;
                      "
                    >
                      <!--[if mso]>&nbsp;&nbsp;&nbsp;&nbsp;<![endif]-->
                      ${text}
                      <!--[if mso]>&nbsp;&nbsp;&nbsp;&nbsp;<![endif]-->
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
    `;
};

export const sendOtpEmail = async (email: string, otp: string, name?: string) => {
  const loginUrl = process.env.FRONTEND_URL || 'https://pemira.nurulfikri.ac.id';

  // Auto-login link if needed, but standard security usually asks for OTP entry on site.
  // We'll just link to the main site for now.

  const content = `
        <p style="color: #334155; font-size: 16px; margin-bottom: 24px; line-height: 1.5;">
            Halo, <strong>${name || 'Mahasiswa'}</strong>
        </p>
        <p style="color: #64748b; font-size: 15px; margin-bottom: 32px; line-height: 1.6;">
            Kami menerima permintaan untuk masuk ke halaman pemilihan. Gunakan kode OTP di bawah ini untuk melanjutkan:
        </p>
        
        <div style="background-color: #f1f5f9; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 32px; border: 1px dashed #cbd5e1;">
            <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: 700; color: #0f172a; letter-spacing: 8px; display: block;">${otp}</span>
        </div>

        ${getButtonHtml('Masuk ke Website', loginUrl)}

        <p style="color: #64748b; font-size: 14px; margin-bottom: 0; line-height: 1.6;">
            Kode ini akan kedaluwarsa dalam <strong>5 menit</strong>.<br>
            Jika ini bukan Anda, mohon abaikan email ini.
        </p>
    `;

  const html = wrapEmailBody(content);
  return sendEmail(email, '[PEMIRA] Kode OTP Masuk', html);
};
