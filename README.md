# Money Hater - Expense Tracker

A modern, full-stack expense tracking application built with React, TypeScript, Cloudflare Workers, and D1 database.

## 🚀 Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Cloudflare Workers + Hono
- **Database**: Cloudflare D1 (SQLite)
- **ORM**: Prisma with D1 Adapter
- **Styling**: Custom CSS with modern design
- **Charts**: Recharts
- **Icons**: Lucide React

## ✨ Features

- 📊 Track income and expenses
- 📈 Visual analytics and charts
- 🏷️ Category-based organization
- 🔐 **Secure authentication** with JWT tokens
- 🔒 **Password hashing** using PBKDF2
- 👤 **User-specific data** - Each user sees only their own expenses
- 💾 Persistent storage with D1
- 🌐 Serverless architecture
- ⚡ Fast and responsive UI
- 🗄️ **Optimized database** with indexes

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Cloudflare account (for deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd money-hater
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Prisma**
   ```bash
   npx prisma generate
   ```

### Running the Application

You need to run **TWO** development servers:

1. **Start the backend (Cloudflare Worker)**
   ```bash
   npm run dev:worker
   ```
   This runs on `http://localhost:8787`

2. **Start the frontend (Vite)** (in a new terminal)
   ```bash
   npm run dev
   ```
   This runs on `http://localhost:5174`

The frontend automatically proxies API requests to the backend.

## 📚 Database

This project uses **Cloudflare D1** with **Prisma ORM**. See [PRISMA_D1_SETUP.md](./PRISMA_D1_SETUP.md) for detailed documentation on:

- Database schema
- Making schema changes
- Running migrations
- Querying the database
- Production deployment

### Quick Database Commands

```bash
# View users in local database
npx wrangler d1 execute money-hater-db --local --command "SELECT * FROM User"

# Apply migrations locally
npx wrangler d1 migrations apply money-hater-db --local

# Apply migrations to production
npx wrangler d1 migrations apply money-hater-db --remote

# Regenerate Prisma Client
npx prisma generate
```

## 🏗️ Project Structure

```
money-hater/
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── context/           # React context (Auth, etc.)
│   ├── pages/             # Page components
│   ├── services/          # API services
│   └── types.ts           # TypeScript types
├── worker/                # Cloudflare Worker (backend)
│   └── index.ts          # API routes with Prisma
├── prisma/               # Database schema and config
│   └── schema.prisma     # Database models
├── migrations/           # D1 migration files
└── wrangler.jsonc       # Cloudflare configuration
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Expenses
- `GET /api/expenses` - Get all expenses
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense

### Automated Deployment with GitHub Actions (Recommended)

The project includes a GitHub Actions workflow for automated CI/CD:

1. **Set up GitHub Secrets** (one-time setup):
   - `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
   - `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

2. **Push to main branch**:
   ```bash
   git push origin main
   ```

The workflow will automatically:
- ✅ Install dependencies
- ✅ Generate Prisma Client
- ✅ Build frontend
- ✅ Apply database migrations
- ✅ Deploy to Cloudflare Workers

📚 **See [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md)** for detailed setup instructions.

### Manual Deployment

If you prefer manual deployment:

```bash
# Build frontend and deploy to Cloudflare
npm run deploy
```

This will:
1. Build the frontend (`npm run build`)
2. Deploy the worker and assets to Cloudflare

### Before First Deployment

1. **Apply migrations to production database**
   ```bash
   npx wrangler d1 migrations apply money-hater-db --remote
   ```

2. **Set JWT_SECRET** (for production security)
   ```bash
   npx wrangler secret put JWT_SECRET
   ```

3. **Deploy**
   ```bash
   npm run deploy
   ```
   Or push to main branch if using GitHub Actions.

## 🔐 Security

✅ **Production-Ready Security Features:**

- ✅ **Password Hashing** - PBKDF2 with 100,000 iterations
- ✅ **JWT Authentication** - Secure token-based auth with 7-day expiration
- ✅ **User-Specific Data** - Users can only access their own expenses
- ✅ **Database Indexes** - Optimized query performance
- ✅ **Cascade Delete** - Automatic cleanup of user data

📚 **See [SECURITY.md](./SECURITY.md)** for detailed security documentation.

**Additional Recommendations for Production:**

- [ ] Set JWT_SECRET environment variable (don't use default)
- [ ] Implement rate limiting
- [ ] Add email verification

## 📝 Available Scripts

- `npm run dev` - Start frontend dev server
- `npm run dev:worker` - Start backend worker
- `npm run build` - Build for production
- `npm run deploy` - Build and deploy to Cloudflare
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Built with [Vite](https://vitejs.dev/)
- Powered by [Cloudflare Workers](https://workers.cloudflare.com/)
- Database by [Cloudflare D1](https://developers.cloudflare.com/d1/)
- ORM by [Prisma](https://www.prisma.io/)
