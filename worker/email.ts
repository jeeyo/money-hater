import { Resend } from 'resend';

export const sendPasswordResetEmail = async (
  email: string,
  resetLink: string,
  resendApiKey: string
) => {
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY is not set. Email not sent.');
    console.log(`[DEV] Password Reset Link for ${email}: ${resetLink}`);
    return;
  }

  const resend = new Resend(resendApiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: 'Money Hater <noreply@hater.money>',
      to: [email],
      subject: 'Reset your password',
      html: `
        <h1>Reset your password</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    if (error) {
      console.error('Failed to send email:', error);
      console.log(`[FALLBACK] Password Reset Link for ${email}: ${resetLink}`);
      return;
    }

    console.log('Email sent successfully to', email, 'ID:', data?.id);
  } catch (err) {
    console.error('Failed to send email:', err);

    console.log(`[FALLBACK] Password Reset Link for ${email}: ${resetLink}`);
  }
};

export const sendVerificationEmail = async (
  email: string,
  verificationLink: string,
  resendApiKey: string
) => {
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY is not set. Email not sent.');
    console.log(`[DEV] Verification Link for ${email}: ${verificationLink}`);
    return;
  }

  const resend = new Resend(resendApiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: 'Money Hater <noreply@hater.money>',
      to: [email],
      subject: 'Verify your email',
      html: `
        <h1>Welcome to Money Hater!</h1>
        <p>Click the link below to verify your email and set your password:</p>
        <a href="${verificationLink}">${verificationLink}</a>
        <p>If you didn't create an account, please ignore this email.</p>
      `,
    });

    if (error) {
      console.error('Failed to send email:', error);
      console.log(`[FALLBACK] Verification Link for ${email}: ${verificationLink}`);
      return;
    }

    console.log('Verification email sent successfully to', email, 'ID:', data?.id);
  } catch (err) {
    console.error('Failed to send verification email:', err);
    console.log(`[FALLBACK] Verification Link for ${email}: ${verificationLink}`);
  }
};
