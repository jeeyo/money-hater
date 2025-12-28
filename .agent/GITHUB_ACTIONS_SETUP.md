# GitHub Actions CI/CD Setup

This guide explains how to set up automated deployment to Cloudflare using GitHub Actions.

## 🚀 What the CI/CD Pipeline Does

The GitHub Actions workflow automatically:

1. ✅ **Installs dependencies** - Runs `npm ci` for clean install
2. ✅ **Generates Prisma Client** - Ensures database types are up-to-date
3. ✅ **Builds the frontend** - Compiles React app for production
4. ✅ **Applies database migrations** - Runs migrations on production D1 database
5. ✅ **Deploys to Cloudflare** - Deploys Worker and static assets

## 📋 Prerequisites

Before setting up GitHub Actions, you need:

1. A GitHub repository for your project
2. A Cloudflare account
3. Cloudflare API Token with appropriate permissions
4. Cloudflare Account ID

## 🔧 Setup Instructions

### Step 1: Get Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**
3. Use the **"Edit Cloudflare Workers"** template, or create a custom token with these permissions:
   - **Account** → **Workers Scripts** → **Edit**
   - **Account** → **Workers KV Storage** → **Edit**
   - **Account** → **D1** → **Edit**
   - **Account** → **Pages** → **Edit** (if using Pages)
4. Set **Account Resources** to include your account
5. Click **"Continue to summary"** → **"Create Token"**
6. **Copy the token** (you won't see it again!)

### Step 2: Get Cloudflare Account ID

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select **Workers & Pages** from the left sidebar
3. Your **Account ID** is shown on the right side of the page
4. Copy the Account ID

### Step 3: Add Secrets to GitHub

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Add these two secrets:

   **Secret 1: CLOUDFLARE_API_TOKEN**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: Your Cloudflare API token from Step 1

   **Secret 2: CLOUDFLARE_ACCOUNT_ID**
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: Your Cloudflare Account ID from Step 2

### Step 4: (Optional) Add JWT Secret

For production security, add your JWT secret:

1. Generate a secure secret:
   ```bash
   openssl rand -base64 32
   ```

2. Add it to Cloudflare Workers:
   ```bash
   npx wrangler secret put JWT_SECRET
   ```
   Then paste the generated secret when prompted.

### Step 5: Push to GitHub

1. Initialize git (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit with CI/CD"
   ```

2. Add your GitHub repository as remote:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   ```

3. Push to main branch:
   ```bash
   git branch -M main
   git push -u origin main
   ```

The GitHub Actions workflow will automatically trigger!

## 📊 Workflow Triggers

The workflow runs on:

- **Push to `main` branch** → Deploys to production
- **Pull Request to `main`** → Runs build and migration checks (no deployment)
- **Manual trigger** → Can be triggered manually from GitHub Actions tab

## 🔄 Workflow Steps Explained

### For Pull Requests (PRs)

When you create a PR:
1. ✅ Checks out code
2. ✅ Installs dependencies
3. ✅ Generates Prisma Client
4. ✅ Builds frontend
5. ✅ Validates migrations exist
6. ✅ Shows build success message
7. ❌ **Does NOT deploy** (safe for testing)

### For Main Branch Pushes

When you merge to main:
1. ✅ Checks out code
2. ✅ Installs dependencies
3. ✅ Generates Prisma Client
4. ✅ Builds frontend
5. ✅ **Applies migrations to production D1**
6. ✅ **Deploys to Cloudflare Workers**

## 📝 Workflow File Location

The workflow is defined in:
```
.github/workflows/deploy.yml
```

## 🔍 Monitoring Deployments

### View Workflow Runs

1. Go to your GitHub repository
2. Click the **"Actions"** tab
3. See all workflow runs and their status

### View Deployment Logs

1. Click on a workflow run
2. Click on the **"Deploy Application"** job
3. Expand each step to see detailed logs

### Check Cloudflare Deployment

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Find your `money-hater` worker
4. Click on it to see deployment details and logs

## 🛠️ Customizing the Workflow

### Change Branch Name

If you use a different main branch (e.g., `master`):

```yaml
on:
  push:
    branches:
      - master  # Change this
```

### Add Environment-Specific Deployments

For staging and production environments:

```yaml
jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    # ... deploy to staging
  
  deploy-production:
    if: github.ref == 'refs/heads/main'
    # ... deploy to production
```

### Add Tests Before Deployment

```yaml
- name: Run tests
  run: npm test

- name: Run linter
  run: npm run lint
```

### Add Slack/Discord Notifications

Use GitHub Actions marketplace actions:
- [Slack Notify](https://github.com/marketplace/actions/slack-notify)
- [Discord Webhook](https://github.com/marketplace/actions/discord-webhook)

## 🚨 Troubleshooting

### "Authentication error" or "Invalid API token"

**Solution:**
- Verify `CLOUDFLARE_API_TOKEN` is correctly set in GitHub Secrets
- Ensure the token has the required permissions
- Check if the token has expired

### "Account ID not found"

**Solution:**
- Verify `CLOUDFLARE_ACCOUNT_ID` is correctly set in GitHub Secrets
- Make sure you copied the full Account ID

### "Database not found"

**Solution:**
- Ensure the D1 database exists in your Cloudflare account
- Check `wrangler.jsonc` has the correct database ID
- Verify the database name matches in both files

### "Build failed"

**Solution:**
- Check the workflow logs for specific error messages
- Try building locally: `npm run build`
- Ensure all dependencies are in `package.json`

### "Migration failed"

**Solution:**
- Check migration SQL files for syntax errors
- Verify migrations haven't already been applied
- Check D1 database is accessible

## 🔐 Security Best Practices

### Secrets Management

✅ **DO:**
- Store API tokens in GitHub Secrets
- Use environment-specific secrets for staging/production
- Rotate API tokens regularly
- Use minimal required permissions for tokens

❌ **DON'T:**
- Commit API tokens to the repository
- Share secrets in pull request comments
- Use the same token for multiple projects

### Branch Protection

Recommended settings for `main` branch:

1. Go to **Settings** → **Branches** → **Add rule**
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require pull request reviews before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Include administrators

## 📈 Advanced Features

### Automatic Rollback

Add a rollback job:

```yaml
- name: Rollback on failure
  if: failure()
  run: npx wrangler rollback
```

### Deployment Previews

For PR previews:

```yaml
- name: Deploy preview
  if: github.event_name == 'pull_request'
  run: npx wrangler deploy --env preview
```

### Cache Dependencies

Speed up builds:

```yaml
- name: Cache node modules
  uses: actions/cache@v3
  with:
    path: node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
```

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)

## ✅ Checklist

Before pushing to production:

- [ ] GitHub Secrets configured (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [ ] JWT_SECRET set in Cloudflare Workers environment
- [ ] Database exists in Cloudflare D1
- [ ] `wrangler.jsonc` has correct database ID
- [ ] All migrations tested locally
- [ ] Build succeeds locally (`npm run build`)
- [ ] Branch protection rules configured
- [ ] Team members have appropriate access

## 🎉 Success!

Once set up, your deployment workflow is:

1. **Make changes** → Create a branch
2. **Create PR** → CI runs checks
3. **Review & merge** → Auto-deploys to production
4. **Monitor** → Check GitHub Actions and Cloudflare dashboard

Your application is now automatically deployed! 🚀
