# R2 Setup Checklist

Follow this checklist when setting up R2 for the first time in production.

## Prerequisites
- [ ] Cloudflare account with R2 enabled
- [ ] Wrangler CLI installed (`npm install -g wrangler`)
- [ ] `CLOUDFLARE_API_TOKEN` configured
- [ ] `CLOUDFLARE_ACCOUNT_ID` configured

## Local Development Setup

### 1. Verify Wrangler Configuration
- [ ] Check `wrangler.jsonc` has the R2 bucket binding:
  ```jsonc
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "money-hater-storage"
    }
  ]
  ```

### 2. Apply Database Migration
- [ ] Run the migration locally:
  ```bash
  npx wrangler d1 migrations apply money-hater-db --local
  ```
- [ ] Verify the migration succeeded (look for ✅ in output)

### 3. Start Development Servers
- [ ] Terminal 1: Start the worker
  ```bash
  npm run dev:worker
  ```
- [ ] Terminal 2: Start the frontend
  ```bash
  npm run dev
  ```
- [ ] Verify both servers are running without errors

### 4. Test File Upload Locally
- [ ] Open http://localhost:5174
- [ ] Log in or create an account
- [ ] Add a new expense
- [ ] Click "Upload Receipt" and select a test file
- [ ] Verify the file uploads successfully
- [ ] Submit the expense
- [ ] Verify the expense appears in the list

## Production Deployment Setup

### 1. Create R2 Bucket
- [ ] Create the bucket in Cloudflare:
  ```bash
  npx wrangler r2 bucket create money-hater-storage
  ```
- [ ] Verify bucket creation:
  ```bash
  npx wrangler r2 bucket list
  ```
- [ ] You should see `money-hater-storage` in the list

### 2. Apply Database Migration
- [ ] Apply migration to production database:
  ```bash
  npx wrangler d1 migrations apply money-hater-db --remote
  ```
- [ ] Verify all migrations succeeded

### 3. Deploy Application
Choose one method:

#### Option A: GitHub Actions (Recommended)
- [ ] Ensure GitHub secrets are configured:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- [ ] Push to main branch:
  ```bash
  git push origin main
  ```
- [ ] Monitor the GitHub Actions workflow
- [ ] Verify deployment succeeded

#### Option B: Manual Deployment
- [ ] Build and deploy:
  ```bash
  npm run deploy
  ```
- [ ] Verify deployment succeeded

### 4. Verify Production Deployment
- [ ] Open your production URL
- [ ] Test user registration/login
- [ ] Test file upload functionality
- [ ] Verify files are stored in R2:
  ```bash
  npx wrangler r2 object list money-hater-storage
  ```

## Post-Deployment Verification

### Test File Upload in Production
- [ ] Create a test expense
- [ ] Upload a small test file (< 1MB)
- [ ] Verify upload succeeds
- [ ] Note the returned file key
- [ ] Verify file is in R2:
  ```bash
  npx wrangler r2 object get money-hater-storage {file-key}
  ```

### Monitor R2 Usage
- [ ] Check Cloudflare Dashboard > R2
- [ ] Verify the bucket contains uploaded files
- [ ] Monitor storage usage
- [ ] Check for any errors in logs

## Troubleshooting

### Bucket Not Found
**Problem**: "Bucket 'money-hater-storage' not found"

**Solution**:
```bash
# Check if bucket exists
npx wrangler r2 bucket list

# Create if missing
npx wrangler r2 bucket create money-hater-storage
```

### Migration Failed
**Problem**: Migration fails with "duplicate column" error

**Solution**: This is normal if you've already run the migration. The columns already exist in your database.

### Upload Returns 401
**Problem**: Upload fails with "Unauthorized" error

**Solution**:
- [ ] Verify you're logged in
- [ ] Check JWT token is valid
- [ ] Verify token is being sent in Authorization header
- [ ] Check browser console for error details

### Upload Returns 500
**Problem**: Upload fails with "Internal Server Error"

**Solution**:
- [ ] Check Cloudflare Worker logs:
  ```bash
  npx wrangler tail
  ```
- [ ] Verify R2 bucket exists
- [ ] Verify bucket binding is correct in wrangler.jsonc

## Security Checklist

### Before Going to Production
- [ ] **JWT_SECRET**: Set a secure JWT secret
  ```bash
  npx wrangler secret put JWT_SECRET
  ```
- [ ] **File Type Validation**: Verify only allowed file types can be uploaded
- [ ] **File Size Limits**: Consider implementing file size limits
- [ ] **Rate Limiting**: Consider implementing rate limiting on upload endpoint
- [ ] **Access Control**: Verify users can only access their own files

### Ongoing Security
- [ ] Monitor R2 storage usage for anomalies
- [ ] Regularly review uploaded files
- [ ] Implement file expiration policies if needed
- [ ] Set up alerts for unusual upload patterns

## Cost Monitoring

### Set Up Cost Alerts
- [ ] Go to Cloudflare Dashboard > R2
- [ ] Review current usage
- [ ] Set up budget alerts if available
- [ ] Monitor costs monthly

### Expected Costs (Estimate)
For typical usage:
- **10 users, 100 receipts/month each**: ~$0.10/month
- **100 users, 100 receipts/month each**: ~$1.00/month
- **1000 users, 100 receipts/month each**: ~$10.00/month

## Maintenance

### Monthly Tasks
- [ ] Review R2 storage usage
- [ ] Check for orphaned files (files without associated expenses)
- [ ] Review costs and optimize if needed

### As Needed
- [ ] Implement file cleanup for deleted expenses
- [ ] Add image optimization/compression
- [ ] Implement file archival policies

## Resources

- **R2 Documentation**: https://developers.cloudflare.com/r2/
- **Wrangler Docs**: https://developers.cloudflare.com/workers/wrangler/
- **Project Docs**: See R2_SETUP.md and R2_INTEGRATION_SUMMARY.md

---

✅ **Setup Complete!**

If you've checked all the boxes, your R2 integration is ready for production use!
