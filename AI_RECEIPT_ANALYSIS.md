# AI Receipt Analysis Feature

## Overview
Added AI-powered receipt analysis functionality that uses Gemini's vision model to automatically extract expense information from receipt images and auto-fill the expense form.

## Features

### 1. Backend API Endpoint (`/api/analyze-receipt`)
- **Location**: `worker/index.ts`
- **Method**: POST
- **Authentication**: Required (JWT token)
- **Accepts**: Image files (multipart/form-data)
- **Returns**: Extracted expense data or error message

**Extracted Data**:
- Description (e.g., "Coffee at Starbucks")
- Amount (numeric value without currency)
- Date (ISO format: YYYY-MM-DD)
- Category (from predefined list)
- Tags (1-3 relevant tags)

**Error Handling**:
- Returns `error: true` if receipt cannot be processed
- Validates file type (images only)
- Provides user-friendly error messages

### 2. Frontend Components

#### Toast Notification System
- **Location**: `src/components/Toast.tsx`
- **Types**: Success, Error, Warning
- **Features**:
  - Auto-dismisses after 5 seconds
  - Manual close button
  - Smooth slide-in animation
  - Dark mode support

#### AI Receipt Analysis Button
- **Location**: `src/components/ExpenseForm.tsx`
- **Design**: 
  - Prominent gradient background (indigo to purple)
  - Clear labeling with icon
  - Loading state with spinner
  - Disabled during analysis

### 3. User Flow

1. User clicks "Scan Receipt with AI" button
2. File picker opens (images only)
3. Selected image is sent to Gemini for analysis
4. Form fields are auto-filled with extracted data:
   - Description
   - Amount
   - Date
   - Category
   - Tags
5. Image is also uploaded as attachment
6. Success/error toast notification is shown

### 4. Error Handling

The system shows warning toasts in these scenarios:
- Non-image file selected
- Receipt cannot be processed (unclear image, no receipt visible)
- Network/API errors
- AI service not configured

### 5. Technical Details

**Gemini Model**: `gemini-2.5-flash` (vision-capable)

**Image Processing**:
- Uploads image to Gemini Files API (more efficient than base64)
- Files are automatically deleted after processing
- Supports images up to 2GB
- Sends to Gemini with structured prompt
- Uses JSON schema for consistent response format

**Conservative Approach**:
- AI only returns data if confident
- Sets `error: true` if uncertain
- Prevents incorrect auto-filling

## Usage

1. Navigate to the expense form (New Expense or Edit Expense)
2. Scroll to "AI Receipt Analysis" section
3. Click the button and select a receipt image
4. Wait for analysis (usually 2-5 seconds)
5. Review auto-filled data and make adjustments if needed
6. Submit the form

## Benefits

- **Time-saving**: No manual data entry
- **Accuracy**: AI extracts exact amounts and dates
- **Convenience**: Automatic categorization and tagging
- **Attachment**: Receipt image is saved automatically

## Limitations

- Only supports image files (JPEG, PNG, etc.)
- Requires clear, readable receipt images
- May not work with heavily damaged or blurry receipts
- Requires GEMINI_API_KEY to be configured in environment
