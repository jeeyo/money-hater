# CI/CD Quick Reference

## 🚀 Quick Setup (5 minutes)

### 1. Get Cloudflare Credentials

```bash
# Get API Token: https://dash.cloudflare.com/profile/api-tokens
# Get Account ID: https://dash.cloudflare.com/ (Workers & Pages section)
```

### 2. Add to GitHub Secrets

Go to: **Repository → Settings → Secrets → Actions → New repository secret**

Add these two secrets:
- `CLOUDFLARE_API_TOKEN` = your_api_token_here
- `CLOUDFLARE_ACCOUNT_ID` = your_account_id_here

### 3. Push to GitHub

```bash
git add .
git commit -m "Add CI/CD workflow"
git push origin main
```

**Done!** 🎉 Your app will auto-deploy on every push to main.

---

## 📊 Workflow Behavior

| Event | What Happens |
|-------|--------------|
| **Push to `main`** | ✅ Build → ✅ Migrate DB → ✅ Deploy |
| **Pull Request** | ✅ Build → ✅ Check migrations → ❌ No deploy |
| **Manual trigger** | ✅ Build → ✅ Migrate DB → ✅ Deploy |

---

## 🔍 Monitoring

### View Workflow Status
```
GitHub → Your Repo → Actions tab
```

### View Deployment
```
Cloudflare Dashboard → Workers & Pages → money-hater
```

### View Logs
```
GitHub Actions → Click workflow run → Click job → Expand steps
```

---

## 🛠️ Common Commands

### Trigger Manual Deployment
```
GitHub → Actions → Deploy to Cloudflare → Run workflow
```

### Check Migration Status
```bash
npx wrangler d1 migrations list money-hater-db --remote
```

### View Production Database
```bash
npx wrangler d1 execute money-hater-db --remote --command "SELECT * FROM User LIMIT 5"
```

### Set Environment Variable
```bash
npx wrangler secret put JWT_SECRET
```

---

## 🚨 Troubleshooting

### Build Fails
```bash
# Test locally first
npm ci
npm run build
```

### Migration Fails
```bash
# Check migration files
ls -la migrations/

# Test migration locally
npx wrangler d1 migrations apply money-hater-db --local
```

### Deployment Fails
```bash
# Check wrangler config
cat wrangler.jsonc

# Test deployment locally
npx wrangler deploy --dry-run
```

### Authentication Error
- Verify GitHub Secrets are set correctly
- Check API token hasn't expired
- Ensure token has correct permissions

---

## 📝 Workflow File

Location: `.github/workflows/deploy.yml`

Key sections:
- **Triggers**: When workflow runs
- **Jobs**: What gets executed
- **Steps**: Individual tasks
- **Secrets**: Environment variables

---

## 🔐 Security Checklist

Before going live:

- [ ] `CLOUDFLARE_API_TOKEN` set in GitHub Secrets
- [ ] `CLOUDFLARE_ACCOUNT_ID` set in GitHub Secrets
- [ ] `JWT_SECRET` set in Cloudflare Workers
- [ ] `.env` file in `.gitignore`
- [ ] Branch protection enabled on `main`
- [ ] Database migrations tested locally

---

## 📚 Full Documentation

- [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) - Complete setup guide
- [SECURITY.md](./SECURITY.md) - Security documentation
- [PRISMA_D1_SETUP.md](./PRISMA_D1_SETUP.md) - Database documentation
- [README.md](./README.md) - Project overview

---

## 🎯 Deployment Flow

```
┌─────────────────┐
│  Push to main   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GitHub Actions  │
│   triggered     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Install deps &  │
│ Generate Prisma │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Build frontend │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Apply migrations│
│   to D1 prod    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Deploy to       │
│ Cloudflare      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Live! 🚀      │
└─────────────────┘
```

---

## 💡 Pro Tips

1. **Test locally before pushing**
   ```bash
   npm run build
   npx wrangler d1 migrations apply money-hater-db --local
   ```

2. **Use PR workflow for testing**
   - Create branch → Make changes → Open PR
   - CI runs checks without deploying
   - Merge when green ✅

3. **Monitor first deployment**
   - Watch GitHub Actions logs
   - Check Cloudflare dashboard
   - Test the live URL

4. **Set up notifications**
   - GitHub → Settings → Notifications
   - Get alerts for failed workflows

5. **Keep secrets secure**
   - Never commit `.env` files
   - Rotate API tokens regularly
   - Use minimal permissions

---

**Need help?** See [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) for detailed instructions.
