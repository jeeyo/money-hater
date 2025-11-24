# Cloudflare R2 Object Storage Integration

This document explains how to set up and use Cloudflare R2 object storage for file attachments in the Money Hater application.

## Overview

R2 is integrated to store file attachments (receipts, invoices, etc.) for expenses. Files are uploaded to R2 and referenced by a key stored in the database.

## Setup Instructions

### 1. Create an R2 Bucket

First, create an R2 bucket in your Cloudflare account:

```bash
npx wrangler r2 bucket create money-hater-storage
```

Or create it via the Cloudflare Dashboard:
1. Go to R2 in your Cloudflare Dashboard
2. Click "Create bucket"
3. Name it `money-hater-storage`
4. Click "Create bucket"

### 2. Verify Configuration

The R2 bucket is already configured in `wrangler.jsonc`:

```json
"r2_buckets": [
  {
    "binding": "BUCKET",
    "bucket_name": "money-hater-storage"
  }
]
```

### 3. Database Schema

The `Expense` model includes an `attachmentUrl` field to store the R2 object key:

```prisma
model Expense {
  // ... other fields
  attachmentUrl String?
  // ... other fields
}
```

## API Endpoints

### Upload File
**POST** `/api/upload`

Uploads a file to R2 and returns the storage key.

**Headers:**
- `Authorization: Bearer <token>`

**Body:**
- `multipart/form-data` with a `file` field

**Response:**
```json
{
  "key": "user-id/timestamp-filename.ext"
}
```

### Get File
**GET** `/api/files/:key`

Retrieves a file from R2.

**Headers:**
- `Authorization: Bearer <token>`

**Parameters:**
- `key`: The R2 object key returned from upload

**Response:**
- The file with appropriate headers

## File Storage Structure

Files are stored with the following key pattern:
```
{userId}/{timestamp}-{filename}
```

Example:
```
abc123-def456/1732462853000-receipt.jpg
```

This structure:
- Organizes files by user
- Prevents naming conflicts with timestamps
- Preserves original filenames for debugging

## Usage in Frontend

The `ExpenseForm` component includes file upload functionality:

1. User selects a file (images or PDFs)
2. File is uploaded to `/api/upload`
3. Returned key is stored with the expense
4. File can be retrieved later via `/api/files/:key`

## Security Considerations

- All endpoints require authentication
- Users can only upload files associated with their expenses
- File types are restricted to images and PDFs
- Files are accessed through authenticated endpoints (not public URLs)

## Local Development

For local development, R2 buckets are simulated by Wrangler. The bucket is automatically available when running:

```bash
npm run dev:worker
```

## Production Deployment

When deploying to production:

1. Ensure the R2 bucket exists:
   ```bash
   npx wrangler r2 bucket create money-hater-storage
   ```

2. Deploy normally:
   ```bash
   npm run deploy
   ```

## Cost Considerations

R2 pricing (as of 2024):
- Storage: $0.015 per GB/month
- Class A Operations (write): $4.50 per million
- Class B Operations (read): $0.36 per million
- No egress fees

For a typical expense tracking app, costs should be minimal (< $1/month for most users).

## Troubleshooting

### "Bucket not found" error
Ensure the bucket is created in the correct Cloudflare account:
```bash
npx wrangler r2 bucket list
```

### Upload fails locally
Make sure you're running the worker with Wrangler:
```bash
npm run dev:worker
```

### File not accessible
Verify the user is authenticated and the key exists:
```bash
npx wrangler r2 object get money-hater-storage {key}
```
