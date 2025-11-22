# CI/CD Architecture Diagram

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Developer Workflow                       │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│  Developer   │
│   Machine    │
└──────┬───────┘
       │
       │ git push origin main
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                          GitHub                                   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              GitHub Actions Workflow                    │     │
│  │                                                          │     │
│  │  Step 1: Checkout Code                                  │     │
│  │  ├─ Clone repository                                    │     │
│  │  └─ Checkout main branch                                │     │
│  │                                                          │     │
│  │  Step 2: Setup Node.js                                  │     │
│  │  ├─ Install Node.js 20                                  │     │
│  │  └─ Cache npm dependencies                              │     │
│  │                                                          │     │
│  │  Step 3: Install Dependencies                           │     │
│  │  └─ npm ci                                              │     │
│  │                                                          │     │
│  │  Step 4: Generate Prisma Client                         │     │
│  │  └─ npx prisma generate                                 │     │
│  │                                                          │     │
│  │  Step 5: Build Frontend                                 │     │
│  │  └─ npm run build                                       │     │
│  │                                                          │     │
│  │  Step 6: Apply Database Migrations                      │     │
│  │  └─ npx wrangler d1 migrations apply --remote          │     │
│  │                                                          │     │
│  │  Step 7: Deploy to Cloudflare                           │     │
│  │  └─ npx wrangler deploy                                 │     │
│  │                                                          │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Secrets Used:                                                   │
│  • CLOUDFLARE_API_TOKEN                                          │
│  • CLOUDFLARE_ACCOUNT_ID                                         │
│                                                                   │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            │ Deploy via Wrangler CLI
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Cloudflare Platform                          │
│                                                                   │
│  ┌────────────────────┐         ┌─────────────────────┐         │
│  │  Cloudflare D1     │         │  Cloudflare Workers │         │
│  │   (Database)       │◄────────┤   (Backend API)     │         │
│  │                    │         │                     │         │
│  │  • User table      │         │  • Hono framework   │         │
│  │  • Expense table   │         │  • Prisma Client    │         │
│  │  • Indexes         │         │  • JWT Auth         │         │
│  │  • Migrations      │         │  • Password hashing │         │
│  └────────────────────┘         └──────────┬──────────┘         │
│                                             │                     │
│                                             │ Serves              │
│                                             │                     │
│                                  ┌──────────▼──────────┐         │
│                                  │  Static Assets      │         │
│                                  │  (Frontend)         │         │
│                                  │                     │         │
│                                  │  • React App        │         │
│                                  │  • CSS              │         │
│                                  │  • JavaScript       │         │
│                                  │  • Images           │         │
│                                  └─────────────────────┘         │
│                                                                   │
│  Environment Variables:                                          │
│  • JWT_SECRET (set via wrangler secret)                          │
│                                                                   │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            │ HTTPS
                            │
                            ▼
                    ┌───────────────┐
                    │   End Users   │
                    │   (Browser)   │
                    └───────────────┘
```

## 🔄 Deployment Flow Details

### 1. Code Push
```
Developer → git push → GitHub Repository
```

### 2. Trigger Workflow
```
GitHub detects push to main → Triggers workflow → Starts runner
```

### 3. Build Phase
```
Install dependencies → Generate Prisma → Build React app
```

### 4. Database Phase
```
Connect to D1 → Apply migrations → Verify schema
```

### 5. Deploy Phase
```
Package worker → Upload to Cloudflare → Deploy globally
```

### 6. Live
```
Cloudflare edge network → Serves app worldwide → Users access
```

## 🔐 Security Flow

```
┌──────────────┐
│   GitHub     │
│   Secrets    │
└──────┬───────┘
       │
       │ Injected as environment variables
       │
       ▼
┌──────────────────┐
│ GitHub Actions   │
│    Runner        │
└──────┬───────────┘
       │
       │ Used for authentication
       │
       ▼
┌──────────────────┐
│   Cloudflare     │
│      API         │
└──────┬───────────┘
       │
       │ Deploys to
       │
       ▼
┌──────────────────┐
│  Production      │
│  Environment     │
└──────────────────┘
```

## 📊 Data Flow

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ HTTPS Request
       │
       ▼
┌──────────────────────┐
│ Cloudflare Workers   │
│  (Backend API)       │
└──────┬───────────────┘
       │
       │ JWT Validation
       │
       ▼
┌──────────────────────┐
│   Prisma Client      │
└──────┬───────────────┘
       │
       │ SQL Queries
       │
       ▼
┌──────────────────────┐
│  Cloudflare D1       │
│   (SQLite)           │
└──────────────────────┘
```

## 🌍 Global Distribution

```
                    ┌─────────────────┐
                    │   Cloudflare    │
                    │   Global CDN    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  US Region    │    │  EU Region    │    │ Asia Region   │
│               │    │               │    │               │
│ • Workers     │    │ • Workers     │    │ • Workers     │
│ • D1 Replica  │    │ • D1 Replica  │    │ • D1 Replica  │
│ • Assets      │    │ • Assets      │    │ • Assets      │
└───────────────┘    └───────────────┘    └───────────────┘
```

## 🔄 PR Workflow vs Main Workflow

### Pull Request (No Deployment)
```
PR Created → Run Checks → Build → Test → Report Status
                                           ↓
                                    ✅ or ❌ on PR
```

### Main Branch (Full Deployment)
```
Merge to Main → Run Checks → Build → Migrate → Deploy → Live
                                                  ↓
                                           Production 🚀
```

## 📝 File Relationships

```
Repository Root
│
├── .github/workflows/deploy.yml ──────┐
│                                      │ Reads config from
├── wrangler.jsonc ◄───────────────────┤
│   ├── Database ID                    │
│   ├── Worker config                  │
│   └── Assets config                  │
│                                      │
├── prisma/schema.prisma ◄─────────────┤
│   └── Database schema                │
│                                      │
├── migrations/ ◄──────────────────────┤
│   ├── 0001_*.sql                     │
│   ├── 0002_*.sql                     │
│   └── 0003_*.sql                     │
│                                      │
├── worker/index.ts ◄──────────────────┤
│   └── API routes                     │
│                                      │
└── src/ ◄─────────────────────────────┘
    └── React frontend
```

## 🎯 Summary

The CI/CD pipeline provides:

✅ **Automated deployments** - Push to deploy
✅ **Database migrations** - Always in sync
✅ **Quality checks** - Prevent broken code
✅ **Global distribution** - Cloudflare edge network
✅ **Secure secrets** - GitHub + Cloudflare
✅ **Fast builds** - Optimized workflow
✅ **Easy rollbacks** - Git-based versioning

**Result**: Professional, production-ready deployment pipeline! 🚀
