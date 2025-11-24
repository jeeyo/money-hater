# Cloudflare R2 Integration Summary

## What Was Done

### 1. Infrastructure Configuration
- ✅ Added R2 bucket binding to `wrangler.jsonc`
- ✅ Bucket name: `money-hater-storage`
- ✅ Binding name: `BUCKET`

### 2. Database Schema Updates
- ✅ Added `attachmentUrl` field to `Expense` model in Prisma schema
- ✅ Created migration `0006_add_attachment_url.sql`
- ✅ Applied migration to local database
- ✅ Regenerated Prisma client

### 3. Backend API Endpoints
Added two new endpoints in `/worker/index.ts`:

#### Upload Endpoint
- **Route**: `POST /api/upload`
- **Auth**: Required (JWT)
- **Body**: `multipart/form-data` with `file` field
- **Returns**: `{ key: string }` - R2 object key

#### Download Endpoint
- **Route**: `GET /api/files/:key`
- **Auth**: Required (JWT)
- **Returns**: File with appropriate headers

### 4. Frontend Updates
Modified `ExpenseForm.tsx`:
- ✅ Added file upload UI with drag-and-drop zone
- ✅ Added file state management
- ✅ Added upload progress indicator
- ✅ Added file removal option
- ✅ Accepts images and PDFs

### 5. TypeScript Types
- ✅ Updated `Expense` interface in `src/types.ts`
- ✅ Updated form submit handler signature
- ✅ Added `attachmentUrl?: string` field

### 6. Documentation
- ✅ Created comprehensive `R2_SETUP.md`
- ✅ Updated `README.md` with R2 information
- ✅ Documented API endpoints
- ✅ Included setup instructions

## Setup Required

### For Local Development
The R2 bucket is automatically simulated by Wrangler. No additional setup needed!

Just run:
```bash
npm run dev:worker
```

### For Production Deployment

1. **Create the R2 bucket**:
   ```bash
   npx wrangler r2 bucket create money-hater-storage
   ```

2. **Apply the database migration**:
   ```bash
   npx wrangler d1 migrations apply money-hater-db --remote
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

## File Storage Structure

Files are stored with the following pattern:
```
{userId}/{timestamp}-{originalFilename}
```

Example:
```
abc123-xyz789/1732462853000-receipt.pdf
```

This ensures:
- ✅ Files are organized by user
- ✅ No naming conflicts
- ✅ Easy to identify file ownership
- ✅ Original filenames preserved for debugging

## Features

### User-Facing Features
- 📎 Upload receipts/invoices for expenses
- 🖼️ Supports images (JPEG, PNG, etc.) and PDFs
- 🗑️ Remove attachments before saving
- 👁️ Visual feedback during upload
- 🔒 Secure file storage with authentication

### Technical Features
- ⚡ Direct upload to R2 (no intermediary storage)
- 🔐 JWT-protected endpoints
- 📊 Efficient file metadata handling
- 🌐 Serverless architecture
- 💰 Cost-effective storage (R2 has no egress fees)

## Testing the Integration

1. **Start the development servers**:
   ```bash
   # Terminal 1
   npm run dev:worker
   
   # Terminal 2
   npm run dev
   ```

2. **Add an expense with attachment**:
   - Navigate to the expense form
   - Fill in expense details
   - Click "Upload Receipt" and select a file
   - Submit the form

3. **Verify the upload**:
   - Check the browser console for the API response
   - The response should include the `attachmentUrl` field

## Next Steps (Optional Enhancements)

Consider these future improvements:
- [ ] Add file type validation on the backend
- [ ] Add file size limits
- [ ] Implement image preview/thumbnails
- [ ] Add bulk upload support
- [ ] Implement file download from expense list
- [ ] Add OCR for automatic receipt data extraction
- [ ] Implement image compression before upload

## Cost Estimation

Based on typical usage:
- **Storage**: ~$0.015/GB/month
- **Upload operations**: $4.50/million
- **Download operations**: $0.36/million

For a single user with ~100 receipts/month:
- Storage: ~10MB = **$0.0002/month**
- Operations: ~200 requests = **$0.001/month**

**Total cost: Less than $0.01/month per user!**

## Troubleshooting

### TypeScript Errors
The current implementation uses `as any` type assertions for Prisma data objects. This is a temporary workaround until the dev server restarts and picks up the new Prisma types.

To fix permanently:
1. Restart both dev servers
2. The new Prisma types should be recognized

### R2 Bucket Not Found
If you see "bucket not found" errors:
```bash
# List buckets
npx wrangler r2 bucket list

# Create if missing
npx wrangler r2 bucket create money-hater-storage
```

### Upload Fails
Check:
1. JWT token is valid
2. File size is reasonable (< 100MB recommended)
3. File type is allowed
4. Dev server is running

## Security Considerations

✅ **Implemented Security**:
- All endpoints require authentication
- Files are stored with user ID prefix
- No public access to files
- Files accessed through authenticated endpoints only

⚠️ **Additional Security Recommendations**:
- Implement virus scanning for uploaded files
- Add rate limiting on upload endpoint
- Validate file types on backend (not just frontend)
- Set maximum file size limits
- Implement file expiration/cleanup policies
