import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Sparkles, Loader2, Tag as TagIcon, X, Save, Pencil, ArrowRightLeft, TrendingUp, TrendingDown, Upload, Paperclip } from 'lucide-react';
import { ExpenseCategory, IncomeCategory, type Expense, type TransactionType, type AIClassificationResult } from '../types';
import { classifyExpense } from '../services/geminiService';
import Toast, { type ToastType } from './Toast';


interface ExpenseFormProps {
  onSubmit: (data: { description: string; amount: number; date: string; category: ExpenseCategory | IncomeCategory; type: TransactionType; tags: string[]; attachmentUrl?: string }) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  initialData?: Expense | null;
  initialFile?: File | null;
}

const EXCHANGE_RATE = 34; // 1 USD = 34 THB

const ExpenseForm: React.FC<ExpenseFormProps> = ({ onSubmit, onCancel, onDelete, initialData, initialFile }) => {
  const [description, setDescription] = useState(initialData?.description || '');
  const [amount, setAmount] = useState(initialData?.amount.toString() || '');
  const [currency, setCurrency] = useState<'THB' | 'USD'>('THB');
  const [date, setDate] = useState(initialData?.date ? initialData.date.split('T')[0] : new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<TransactionType>(initialData?.type || 'expense');
  const [category, setCategory] = useState<ExpenseCategory | IncomeCategory>(initialData?.category || ExpenseCategory.OTHER);
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>(initialData?.attachmentUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAIEnabled, setIsAIEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);


  const isEditing = !!initialData;

  // Process shared file on mount
  useEffect(() => {
    if (initialFile) {
      analyzeFile(initialFile);
    }
  }, [initialFile]);

  const handleAutoClassify = useCallback(async () => {
    if (!description) return;

    setIsThinking(true);
    const amountNum = parseFloat(amount);
    // Pass the amount to AI, but it doesn't strictly rely on currency for categorization
    const result: AIClassificationResult | null = await classifyExpense(description, isNaN(amountNum) ? undefined : amountNum);

    if (result) {
      if (result.type) setType(result.type);
      setCategory(result.category);
      setTags(result.tags);
      // If user hasn't entered an amount and AI predicted one, use it
      if (!amount && result.predictedAmount) {
        setAmount(result.predictedAmount.toString());
      }
    }
    setIsThinking(false);
  }, [description, amount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;

    const rawAmount = parseFloat(amount);
    const finalAmount = currency === 'USD' ? rawAmount * EXCHANGE_RATE : rawAmount;

    onSubmit({
      description,
      amount: finalAmount,
      date,
      type,
      category,
      tags,
      attachmentUrl,
    });

    // If not handling close in parent immediately, reset form
    if (!isEditing) {
      setDescription('');
      setAmount('');
      setCurrency('THB');
      setType('expense');
      setCategory(ExpenseCategory.OTHER);
      setTags([]);
      setAttachmentUrl(undefined);
    }
  };

  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.currentTarget.value.trim();
      if (val && !tags.includes(val)) {
        setTags([...tags, val]);
        e.currentTarget.value = '';
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      setAttachmentUrl(data.key);
    } catch (err) {
      console.error('Upload error:', err);
      setToast({ message: 'Failed to upload file', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  // Analyze a file (shared or uploaded)
  const analyzeFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setToast({ message: 'Please upload an image file', type: 'warning' });
      return;
    }

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/analyze-receipt', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        setToast({ message: data.error || 'Failed to analyze receipt', type: 'error' });
        return;
      }

      // Auto-fill form with extracted data
      if (data.description) setDescription(data.description);
      if (data.amount) setAmount(data.amount.toString());
      if (data.date) setDate(data.date);
      if (data.category) setCategory(data.category);
      if (data.tags && data.tags.length > 0) setTags(data.tags);

      // Also upload the file for attachment
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: uploadFormData
      });

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        setAttachmentUrl(uploadData.key);
      }

      // Show success message with extracted details
      const amountText = data.amount ? `฿${data.amount.toLocaleString()}` : '';
      const categoryText = data.category || '';
      const details = [amountText, categoryText].filter(Boolean).join(' • ');
      const message = details
        ? `Receipt analyzed: ${details}`
        : 'Receipt analyzed successfully!';

      setToast({ message, type: 'success' });
    } catch (err) {
      console.error('Receipt analysis error:', err);
      setToast({ message: 'Failed to analyze receipt', type: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await analyzeFile(file);

    // Reset the input so the same file can be selected again
    e.target.value = '';
  };

  const handleViewAttachment = async (key: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/attachments/${encodeURIComponent(key)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch attachment');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error viewing attachment:', err);
      setToast({ message: 'Failed to view attachment', type: 'error' });
    }
  };


  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 h-full flex flex-col transition-colors">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          {isEditing ? <Pencil className="w-5 h-5 text-indigo-600" /> : <Plus className="w-5 h-5 text-indigo-600" />}
          {isEditing ? 'Edit Expense' : 'New Expense'}
        </h2>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="space-y-5 flex-1">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
          <div className="relative">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (!isEditing && description.length > 3 && tags.length === 0) handleAutoClassify() }}
              placeholder="e.g., Starbucks Coffee"
              className="w-full p-3 pr-10 bg-slate-800 dark:bg-slate-900 text-white border-transparent rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder-slate-400"
              required
              autoFocus={!isEditing}
            />
            <button
              type="button"
              onClick={handleAutoClassify}
              disabled={isThinking || !description}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
              title="Auto-categorize with AI"
            >
              {isThinking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            </button>
          </div>
          {!isEditing && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Type a description and let AI fill the rest.</p>}
        </div>

        {/* Type Toggle */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl">
          <button
            type="button"
            onClick={() => { setType('expense'); setCategory(ExpenseCategory.OTHER); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${type === 'expense' ? 'bg-white dark:bg-slate-700 text-red-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
          >
            <TrendingDown className="w-4 h-4" />
            Expense
          </button>
          <button
            type="button"
            onClick={() => { setType('income'); setCategory(IncomeCategory.OTHER); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${type === 'income' ? 'bg-white dark:bg-slate-700 text-green-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
          >
            <TrendingUp className="w-4 h-4" />
            Income
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Amount</label>
            <div className="flex rounded-xl bg-slate-800 dark:bg-slate-900 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 transition-colors">
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full p-3 bg-slate-800 dark:bg-slate-900 text-white border-none outline-none placeholder-slate-400 min-w-0 transition-colors"
                required
              />
              <div className="relative border-l border-slate-600">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'THB' | 'USD')}
                  className="h-full pl-2 pr-6 bg-slate-800 dark:bg-slate-900 text-slate-200 text-sm font-medium outline-none cursor-pointer appearance-none hover:text-white transition-colors"
                >
                  <option value="THB">THB</option>
                  <option value="USD">USD</option>
                </select>
                {/* Custom dropdown arrow because default one is ugly/hidden in some browsers with appearance-none */}
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>
            {currency === 'USD' && amount && (
              <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                <ArrowRightLeft className="w-3 h-3" />
                <span>≈ ฿{(parseFloat(amount) * EXCHANGE_RATE).toLocaleString()}</span>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-3 bg-slate-800 dark:bg-slate-900 text-white border-transparent rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none [color-scheme:dark] transition-colors"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className="w-full p-3 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-800 dark:text-white transition-colors"
          >
            {type === 'expense' ? (
              Object.values(ExpenseCategory).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))
            ) : (
              Object.values(IncomeCategory).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tags</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 transition-colors">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-indigo-900">×</button>
              </span>
            ))}
          </div>
          <div className="relative">
            <TagIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              onKeyDown={handleTagInput}
              placeholder="Add tag & press Enter"
              className="w-full p-2 pl-9 bg-slate-800 dark:bg-slate-900 text-white border-transparent rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Attachment</label>
          <div className="flex items-center gap-2">

            {!attachmentUrl && (
              <button
                type="button"
                onClick={() => setIsAIEnabled(!isAIEnabled)}
                className={`p-3 border-2 rounded-xl transition-all duration-300 ${isAIEnabled
                  ? 'border-indigo-500 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-500 dark:hover:text-indigo-400'
                  }`}
                title={isAIEnabled ? "Disable AI Receipt Reading" : "Enable AI Receipt Reading"}
              >
                <Sparkles className={`w-5 h-5 ${isAIEnabled ? 'fill-indigo-400' : ''}`} />
              </button>
            )}

            <label className="flex-1 cursor-pointer group">
              <div className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl transition-all duration-300 ${isAIEnabled
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-500 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400'
                }`}>

                {isUploading || isAnalyzing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                ) : attachmentUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleViewAttachment(attachmentUrl);
                      }}
                      className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-full transition-colors z-10"
                      title="View Attachment"
                    >
                      <Paperclip className="w-5 h-5 text-indigo-500" />
                    </button>
                    <span className="text-indigo-500 font-medium">View</span>
                  </>
                ) : (
                  <>
                    {isAIEnabled ? (
                      <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                    ) : (
                      <Upload className="w-5 h-5 group-hover:text-indigo-500 transition-colors" />
                    )}
                    <span className={isAIEnabled ? "text-indigo-600 dark:text-indigo-400 font-medium" : "group-hover:text-indigo-500 transition-colors"}>
                      {isAIEnabled ? 'Upload to AI' : 'Upload Receipt'}
                    </span>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                onChange={isAIEnabled ? handleAnalyzeReceipt : handleFileUpload}
                accept={isAIEnabled ? "image/*" : "image/*,.pdf"}
                disabled={isUploading || isAnalyzing}
              />
            </label>

            {attachmentUrl && (
              <button
                type="button"
                onClick={() => setAttachmentUrl(undefined)}
                className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                title="Remove attachment"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>


      </div>

      <div className="flex gap-3 mt-8">
        {isEditing && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex-1 bg-red-600 text-white text-sm p-3 rounded-xl font-semibold hover:bg-red-700 transition-colors shadow-md shadow-red-200 dark:shadow-none flex items-center justify-center gap-2"
          >
            <X className="w-5 h-5" />
            Delete
          </button>
        )}
        <button
          type="submit"
          className={`${isEditing && onDelete ? 'flex-1' : 'w-full'} bg-indigo-600 text-white text-sm p-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2`}
        >
          {isEditing ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {isEditing ? 'Save Changes' : 'Add Transaction'}
        </button>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </form>
  );
};

export default ExpenseForm;

