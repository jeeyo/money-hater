import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GoogleGenAI, Type } from "@google/genai";
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { hashPassword, comparePassword, generateToken, generateResetToken, verifyTurnstile } from './auth';
import { authMiddleware, getAuthUser } from './middleware';
import { sendPasswordResetEmail } from './email';

type Bindings = {
  money_hater_db: D1Database;
  JWT_SECRET: string; // JWT secret from Cloudflare env
  GEMINI_API_KEY: string; // Gemini API key from Cloudflare env
  TURNSTILE_SECRET_KEY: string; // Turnstile secret key env
  BUCKET: R2Bucket; // R2 Bucket binding
  RESEND_API_KEY: string; // Resend API Key
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('/*', cors());

// Helper to get Prisma client
const getPrisma = (c: any) => {
  const adapter = new PrismaD1(c.env.money_hater_db);
  return new PrismaClient({ adapter });
};

// Expense Categories (mirrored from frontend types)
const ExpenseCategory = {
  FOOD: 'Food & Dining',
  TRANSPORT: 'Transportation',
  HOUSING: 'Housing',
  UTILITIES: 'Utilities',
  ENTERTAINMENT: 'Entertainment',
  SHOPPING: 'Shopping',
  HEALTH: 'Health & Fitness',
  TRAVEL: 'Travel',
  EDUCATION: 'Education',
  BUSINESS: 'Business',
  GROCERIES: 'Groceries',
  OTHER: 'Other'
};

const categoriesList = Object.values(ExpenseCategory).join(', ');

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

app.post('/api/auth/register', async (c) => {
  try {
    const prisma = getPrisma(c);
    const data = await c.req.json() as any;

    // Validation
    if (!data.username || !data.password || !data.email) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    if (data.password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    // Verify Turnstile
    if (c.env.TURNSTILE_SECRET_KEY) {
      const isHuman = await verifyTurnstile(data.turnstileToken, c.env.TURNSTILE_SECRET_KEY);
      if (!isHuman) {
        return c.json({ error: 'Invalid captcha' }, 400);
      }
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: data.username },
          { email: data.email }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email === data.email) {
        return c.json({ error: 'Email already registered' }, 409);
      }
      return c.json({ error: 'Username already taken' }, 409);
    }

    // Hash password
    const hashedPassword = await hashPassword(data.password);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        email: data.email,
        name: data.name || data.username
      }
    });

    // Generate JWT token
    const token = await generateToken(
      {
        userId: newUser.id,
        email: newUser.email,
        username: newUser.username
      },
      c.env.JWT_SECRET
    );
    // Return user without password
    const { password, ...userWithoutPassword } = newUser;
    return c.json({
      user: userWithoutPassword,
      token
    }, 201);
  } catch (err) {
    console.error('Registration error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  try {
    const prisma = getPrisma(c);
    const data = await c.req.json() as any;

    if (!data.username || !data.password) {
      return c.json({ error: 'Missing username or password' }, 400);
    }

    // Verify Turnstile
    if (c.env.TURNSTILE_SECRET_KEY) {
      const isHuman = await verifyTurnstile(data.turnstileToken, c.env.TURNSTILE_SECRET_KEY);
      if (!isHuman) {
        return c.json({ error: 'Invalid captcha' }, 400);
      }
    }

    // Find user by username
    const user = await prisma.user.findFirst({
      where: { username: data.username }
    });

    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Verify password
    const isValidPassword = await comparePassword(data.password, user.password);

    if (!isValidPassword) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Generate JWT token
    const token = await generateToken(
      {
        userId: user.id,
        email: user.email,
        username: user.username
      },
      c.env.JWT_SECRET
    );
    // Return user without password
    const { password, ...userWithoutPassword } = user;
    return c.json({
      user: userWithoutPassword,
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.post('/api/auth/forgot-password', async (c) => {
  try {
    const prisma = getPrisma(c);
    const data = await c.req.json() as any;

    if (!data.email) {
      return c.json({ error: 'Missing email' }, 400);
    }

    // Verify Turnstile
    if (c.env.TURNSTILE_SECRET_KEY) {
      const isHuman = await verifyTurnstile(data.turnstileToken, c.env.TURNSTILE_SECRET_KEY);
      if (!isHuman) {
        return c.json({ error: 'Invalid captcha' }, 400);
      }
    }

    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      // For security, don't reveal if user exists
      return c.json({ message: 'If an account with that email exists, we sent you a reset link.' });
    }

    const resetToken = generateResetToken();
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry
      }
    });

    const origin = new URL(c.req.url).origin;
    const resetLink = `${origin}/reset-password?token=${resetToken}`;

    // Send email
    await sendPasswordResetEmail(user.email, resetLink, c.env.RESEND_API_KEY);

    return c.json({
      message: 'If an account with that email exists, we sent you a reset link.',
      debug_link: c.env.RESEND_API_KEY ? undefined : resetLink // Only show link if no API key (dev mode)
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.post('/api/auth/reset-password', async (c) => {
  try {
    const prisma = getPrisma(c);
    const data = await c.req.json() as any;

    if (!data.token || !data.password) {
      return c.json({ error: 'Missing token or password' }, 400);
    }

    if (data.password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: data.token,
        resetTokenExpiry: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      return c.json({ error: 'Invalid or expired reset token' }, 400);
    }

    const hashedPassword = await hashPassword(data.password);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    return c.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

// Get current user info
app.get('/api/auth/me', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true
      }
    });

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user });
  } catch (err) {
    console.error('Get user error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Get expenses for authenticated user
app.get('/api/expenses', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);

    // Get only expenses for the authenticated user
    const expenses = await prisma.expense.findMany({
      where: {
        userId: authUser.userId
      },
      orderBy: {
        date: 'desc'
      }
    });

    // Transform data back to frontend format
    const formattedExpenses = expenses.map(e => ({
      ...e,
      tags: JSON.parse(e.tags),
      date: e.date.toISOString()
    }));

    return c.json(formattedExpenses);
  } catch (err) {
    console.error('Get expenses error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Create expense for authenticated user
app.post('/api/expenses', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const newExpense = await c.req.json() as any;

    // Validation
    if (!newExpense.amount || !newExpense.description) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Create expense for the authenticated user
    const createdExpense = await prisma.expense.create({
      data: {
        amount: parseFloat(newExpense.amount),
        description: newExpense.description,
        date: new Date(newExpense.date || Date.now()),
        type: newExpense.type || 'expense',
        category: newExpense.category || 'Other',
        tags: JSON.stringify(newExpense.tags || []),
        attachmentUrl: newExpense.attachmentUrl,
        createdAt: newExpense.createdAt || Date.now(),
        userId: authUser.userId // Use authenticated user's ID
      } as any
    });

    return c.json({
      ...createdExpense,
      tags: JSON.parse(createdExpense.tags),
      date: createdExpense.date.toISOString()
    }, 201);
  } catch (err) {
    console.error('Create expense error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Update expense (only if it belongs to authenticated user)
app.put('/api/expenses/:id', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');
    const updatedExpense = await c.req.json() as any;

    // Check if expense exists and belongs to user
    const existingExpense = await prisma.expense.findFirst({
      where: {
        id,
        userId: authUser.userId
      }
    });

    if (!existingExpense) {
      return c.json({ error: 'Expense not found or unauthorized' }, 404);
    }

    // Update expense
    const expense = await prisma.expense.update({
      where: { id },
      data: {
        amount: updatedExpense.amount ? parseFloat(updatedExpense.amount) : undefined,
        description: updatedExpense.description,
        date: updatedExpense.date ? new Date(updatedExpense.date) : undefined,
        type: updatedExpense.type,
        category: updatedExpense.category,
        tags: updatedExpense.tags ? JSON.stringify(updatedExpense.tags) : undefined,
        attachmentUrl: updatedExpense.attachmentUrl,
      } as any
    });

    return c.json({
      ...expense,
      tags: JSON.parse(expense.tags),
      date: expense.date.toISOString()
    });
  } catch (err) {
    console.error('Update expense error:', err);
    return c.json({ error: 'Expense not found or error occurred' }, 404);
  }
});

// Delete expense (only if it belongs to authenticated user)
app.delete('/api/expenses/:id', authMiddleware, async (c) => {
  try {
    const prisma = getPrisma(c);
    const authUser = getAuthUser(c);
    const id = c.req.param('id');

    // Check if expense exists and belongs to user
    const existingExpense = await prisma.expense.findFirst({
      where: {
        id,
        userId: authUser.userId
      }
    });

    if (!existingExpense) {
      return c.json({ error: 'Expense not found or unauthorized' }, 404);
    }

    // Delete attachment if exists
    if (existingExpense.attachmentUrl) {
      try {
        await c.env.BUCKET.delete(existingExpense.attachmentUrl);
        console.log(`Deleted attachment: ${existingExpense.attachmentUrl}`);
      } catch (deleteErr) {
        console.error('Failed to delete attachment:', deleteErr);
        // Continue with expense deletion even if attachment deletion fails
      }
    }

    // Delete expense
    await prisma.expense.delete({
      where: { id }
    });

    return c.body(null, 204);
  } catch (err) {
    console.error('Delete expense error:', err);
    return c.json({ error: 'Expense not found' }, 404);
  }
});

// Classify expense using Gemini
app.post('/api/classify', authMiddleware, async (c) => {
  try {
    const { description, amount } = await c.req.json() as { description: string, amount?: number };

    if (!description) {
      return c.json({ error: 'Description is required' }, 400);
    }

    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured');
      return c.json({ error: 'AI service not configured' }, 500);
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash';

    const prompt = `
        Analyze the following expense description and amount (if provided) to determine the most appropriate category and generate 1-3 relevant tags.

        Description: "${description}"
        ${amount ? `Amount: ${amount}` : ''}

        Available Categories: ${categoriesList}

        Rules:
        1. Select exactly one category from the provided list.
        2. Generate 1 to 3 short, relevant tags (lowercase).
        3. If the description is ambiguous, use your best judgment based on common spending habits.
      `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              enum: Object.values(ExpenseCategory),
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["category", "tags"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      return c.json({ error: 'Failed to generate classification' }, 500);
    }

    const data = JSON.parse(text);
    return c.json(data);

  } catch (err) {
    console.error('Classification error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Analyze receipt using Gemini Vision
app.post('/api/analyze-receipt', authMiddleware, async (c) => {
  let uploadedFileUri: string | null = null;

  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'Only image files are supported' }, 400);
    }

    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured');
      return c.json({ error: 'AI service not configured' }, 500);
    }

    const ai = new GoogleGenAI({ apiKey });

    // Upload file to Gemini Files API
    const myfile = await ai.files.upload({
      file: file, // Pass the File/Blob directly
      config: {
        mimeType: file.type,
      },
    });

    uploadedFileUri = myfile.uri ?? null;
    console.log(`Uploaded file: ${uploadedFileUri}`);

    const model = 'gemini-2.5-flash';

    const prompt = `
      Analyze this receipt image and extract the following information:
      1. Description: A brief description of what was purchased (e.g., "Coffee at Starbucks", "Grocery shopping")
      2. Amount: The total amount paid (as a number, without currency symbols)
      3. Date: The date of the transaction in ISO format (YYYY-MM-DD)
      4. Category: Select the most appropriate category from this list: ${categoriesList}
      5. Tags: Generate 1-3 relevant tags (lowercase)

      Rules:
      - If you cannot clearly read the receipt or extract the information, set "error" to true
      - Be conservative - only return data if you're confident about the information
      - For the description, be specific but concise
      - The amount should be a number only (no currency symbols)
      - If the date is not visible, use today's date
    `;

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              fileData: {
                fileUri: myfile.uri,
                mimeType: myfile.mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            error: {
              type: Type.BOOLEAN,
            },
            description: {
              type: Type.STRING,
            },
            amount: {
              type: Type.NUMBER,
            },
            date: {
              type: Type.STRING,
            },
            category: {
              type: Type.STRING,
              enum: Object.values(ExpenseCategory),
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["error"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      return c.json({ error: 'Failed to analyze receipt' }, 500);
    }

    const data = JSON.parse(text);

    if (data.error) {
      return c.json({ error: 'Unable to process receipt. Please ensure the image is clear and contains a valid receipt.' }, 400);
    }

    return c.json(data);

  } catch (err) {
    console.error('Receipt analysis error:', err);
    return c.json({ error: 'Failed to analyze receipt' }, 500);
  } finally {
    // Clean up: Delete the uploaded file from Gemini
    if (uploadedFileUri) {
      try {
        const ai = new GoogleGenAI({ apiKey: c.env.GEMINI_API_KEY });
        await ai.files.delete({ name: uploadedFileUri });
        console.log(`Deleted file: ${uploadedFileUri}`);
      } catch (deleteErr) {
        console.error('Failed to delete uploaded file:', deleteErr);
        // Don't fail the request if cleanup fails
      }
    }
  }
});

// Upload file to R2
app.post('/api/upload', authMiddleware, async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    const authUser = getAuthUser(c);
    const key = `${authUser.userId}/${Date.now()}-${file.name}`;

    await c.env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    return c.json({ key });
  } catch (err) {
    console.error('Upload error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Get file from R2
app.get('/api/attachments/:key', authMiddleware, async (c) => {
  try {
    const key = c.req.param('key');
    const object = await c.env.BUCKET.get(key);

    if (!object) {
      return c.json({ error: 'File not found' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, {
      headers,
    });
  } catch (err) {
    console.error('Get file error:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
