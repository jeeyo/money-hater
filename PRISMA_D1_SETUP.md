# Cloudflare D1 + Prisma Integration ✅

This project successfully integrates **Cloudflare D1** as the database with **Prisma ORM** for type-safe database access.

## ✅ Integration Complete!

The Prisma + D1 integration is now fully functional:

- ✅ Prisma Client installed with D1 adapter
- ✅ D1 database created: `money-hater-db`
- ✅ Database schema defined and migrated
- ✅ Worker updated to use Prisma with D1
- ✅ Development workflow configured
- ✅ **Tested and working!** User registration successfully saves to D1

## Development Setup

### Running the Application

You need to run **TWO** servers in development:

1. **Backend (Cloudflare Worker with D1)**:
   ```bash
   npm run dev:worker
   ```
   This starts the worker on `http://localhost:8787`

2. **Frontend (Vite)**:
   ```bash
   npm run dev
   ```
   This starts the frontend on `http://localhost:5174`
   API requests to `/api/*` are automatically proxied to the worker.

### Why Two Servers?

- The **worker** needs to run in the Cloudflare Workers environment to access D1
- The **frontend** runs in Vite for fast HMR and development experience
- Vite proxies API calls to the worker server

## Database Schema

```prisma
model User {
  id       String    @id @default(uuid())
  email    String    @unique
  username String
  password String
  name     String?
  expenses Expense[]
}

model Expense {
  id          String   @id @default(uuid())
  description String
  amount      Float
  date        DateTime
  type        String
  category    String
  tags        String    // JSON string
  createdAt   Float
  userId      String
  user        User     @relation(fields: [userId], references: [id])
}
```

## Configuration Files

### wrangler.jsonc
```jsonc
{
  "name": "money-hater",
  "compatibility_date": "2025-04-03",
  "main": "./worker/index.ts",
  "d1_databases": [
    {
      "binding": "money_hater_db",
      "database_name": "money-hater-db",
      "database_id": "ee76d04c-c492-4f8a-b1e4-03bd5d58596d"
    }
  ]
}
```

### vite.config.ts
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    }
  }
})
```

## Making Schema Changes

### 1. Update the Schema
Edit `prisma/schema.prisma` with your changes.

### 2. Generate Migration SQL
```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  --output migrations/XXXX_description.sql
```

### 3. Apply Migration Locally
```bash
npx wrangler d1 migrations apply money-hater-db --local
```

### 4. Apply Migration to Production
```bash
npx wrangler d1 migrations apply money-hater-db --remote
```

### 5. Regenerate Prisma Client
```bash
npx prisma generate
```

## Database Operations

### Query Local Database
```bash
npx wrangler d1 execute money-hater-db --local --command "SELECT * FROM User"
```

### Query Production Database
```bash
npx wrangler d1 execute money-hater-db --remote --command "SELECT * FROM User"
```

### View All Tables
```bash
npx wrangler d1 execute money-hater-db --local --command "SELECT name FROM sqlite_master WHERE type='table'"
```

## How It Works

### Worker Implementation (worker/index.ts)

The worker creates a Prisma Client instance for each request using the D1 adapter:

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

type Bindings = {
  money_hater_db: D1Database;
};

const getPrisma = (c: any) => {
  const adapter = new PrismaD1(c.env.money_hater_db);
  return new PrismaClient({ adapter });
};
```

### Example API Route

```typescript
app.post('/api/auth/register', async (c) => {
  const prisma = getPrisma(c);
  const data = await c.req.json();
  
  const newUser = await prisma.user.create({
    data: {
      username: data.username,
      password: data.password,
      email: data.email,
      name: data.name || data.username
    }
  });
  
  return c.json({ user: newUser }, 201);
});
```

## API Endpoints

All endpoints now use Prisma + D1:

### Authentication
- **POST /api/auth/register** - Create new user
- **POST /api/auth/login** - Authenticate user

### Expenses
- **GET /api/expenses** - Get all expenses
- **POST /api/expenses** - Create expense
- **PUT /api/expenses/:id** - Update expense
- **DELETE /api/expenses/:id** - Delete expense

## Production Deployment

### 1. Build the Frontend
```bash
npm run build
```

### 2. Apply Migrations to Production
```bash
npx wrangler d1 migrations apply money-hater-db --remote
```

### 3. Deploy to Cloudflare
```bash
npm run deploy
```

Or use the combined command:
```bash
npm run deploy
```

## Benefits

✅ **Type Safety** - Full TypeScript types for all database operations  
✅ **Auto-completion** - IDE support for queries and models  
✅ **Migration Management** - Version-controlled schema changes  
✅ **Serverless** - D1 is fully serverless and globally distributed  
✅ **Cost Effective** - D1 has a generous free tier  
✅ **Developer Experience** - Prisma provides excellent DX with intuitive API  

## Database Location

### Local Development
`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/[database-id].sqlite`

### Production
Hosted on Cloudflare's global network

## Next Steps

- [ ] Add password hashing (use `bcrypt` or `@node-rs/bcrypt`)
- [ ] Implement proper JWT authentication
- [ ] Add user-specific expense filtering (currently returns all expenses)
- [ ] Add database indexes for performance
- [ ] Set up automated backups for production
- [ ] Add input validation and sanitization
- [ ] Implement rate limiting
- [ ] Add comprehensive error handling

## Troubleshooting

### "Cannot find module @prisma/client"
Run: `npx prisma generate`

### Migration not applying
Make sure the worker dev server is stopped before applying migrations locally.

### Changes not reflected
1. Restart the worker dev server
2. Regenerate Prisma Client: `npx prisma generate`

### CORS errors
The worker already has CORS enabled. Make sure both servers are running.

## Testing

The integration has been tested and verified:
- ✅ User registration successfully creates records in D1
- ✅ Data persists in the local D1 database
- ✅ Prisma Client correctly interfaces with D1
- ✅ API endpoints respond correctly

Example test result:
```
┌──────────────────────────────────────┬───────────────────┬───────────┬─────────────┬───────────┐
│ id                                   │ email             │ username  │ password    │ name      │
├──────────────────────────────────────┼───────────────────┼───────────┼─────────────┼───────────┤
│ fc00f46a-e559-4bd9-b262-756a3a62fa14 │ test2@example.com │ testuser2 │ password123 │ testuser2 │
└──────────────────────────────────────┴───────────────────┴───────────┴─────────────┴───────────┘
```
