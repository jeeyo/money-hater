import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Plus,
  Sparkles,
  Loader2,
  Tag as TagIcon,
  Trash2,
  X,
  Save,
  Pencil,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Upload,
  Paperclip,
} from 'lucide-react';
import {
  ExpenseCategory,
  IncomeCategory,
  type Expense,
  type TransactionType,
  type AIClassificationResult,
} from '../types';
import { classifyExpense } from '../services/geminiService';
import { analyzeReceipt } from '../services/analysisService';
import { showToast } from '../lib/toast';
import {
  expenseFormSchema,
  flattenErrors,
  type ExpenseFormValues,
  type FieldErrors,
} from '../lib/formValidation';

interface ExpenseFormProps {
  onSubmit: (data: {
    description: string;
    amount: number;
    date: string;
    category: ExpenseCategory | IncomeCategory;
    type: TransactionType;
    tags: string[];
    attachmentUrl?: string;
  }) => void;
  onCancel?: () => void;
  onDelete?: () => void;
  initialData?: Expense | null;
  initialFile?: File | null;
}

const EXCHANGE_RATE = 34; // 1 USD = 34 THB

const inputClass =
  'w-full bg-white/5 border border-white/10 text-white rounded-xl outline-none transition-all placeholder-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20';

const ExpenseForm: React.FC<ExpenseFormProps> = ({
  onSubmit,
  onCancel,
  onDelete,
  initialData,
  initialFile,
}) => {
  const [description, setDescription] = useState(initialData?.description || '');
  const [amount, setAmount] = useState(initialData?.amount.toString() || '');
  const [currency, setCurrency] = useState<'THB' | 'USD'>('THB');
  const [date, setDate] = useState(
    initialData?.date ? initialData.date.split('T')[0] : new Date().toISOString().split('T')[0],
  );
  const [type, setType] = useState<TransactionType>(initialData?.type || 'expense');
  const [category, setCategory] = useState<ExpenseCategory | IncomeCategory>(
    initialData?.category || ExpenseCategory.OTHER,
  );
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>(initialData?.attachmentUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAIEnabled, setIsAIEnabled] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<ExpenseFormValues>>({});

  const isEditing = !!initialData;
  const descriptionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) descriptionInputRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    if (initialFile) handleAnalyzeFile(initialFile);
  }, [initialFile]);

  const handleAutoClassify = useCallback(async () => {
    if (!description) return;
    setIsThinking(true);
    const amountNum = parseFloat(amount);
    const result: AIClassificationResult | null = await classifyExpense(
      description,
      isNaN(amountNum) ? undefined : amountNum,
    );
    if (result) {
      if (result.type) setType(result.type);
      setCategory(result.category);
      setTags(result.tags);
      if (!amount && result.predictedAmount) setAmount(result.predictedAmount.toString());
    }
    setIsThinking(false);
  }, [description, amount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmount = parseFloat(amount);
    const finalAmount = currency === 'USD' ? rawAmount * EXCHANGE_RATE : rawAmount;
    const candidate = { description, amount: finalAmount, date, type, category, tags };
    const result = expenseFormSchema.safeParse(candidate);
    if (!result.success) {
      setErrors(flattenErrors<ExpenseFormValues>(result.error));
      return;
    }
    setErrors({});
    onSubmit({
      description: result.data.description,
      amount: result.data.amount,
      date: result.data.date,
      type: result.data.type,
      category: result.data.category as ExpenseCategory | IncomeCategory,
      tags: result.data.tags,
      attachmentUrl,
    });
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

  const removeTag = (tagToRemove: string) => setTags(tags.filter((t) => t !== tagToRemove));

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
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setAttachmentUrl(data.key);
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Failed to upload file', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalyzeFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'warning');
      return;
    }
    setIsAnalyzing(true);
    try {
      const data = await analyzeReceipt(file);
      if (data.description) setDescription(data.description);
      if (data.amount) setAmount(data.amount.toString());
      if (data.date) setDate(data.date);
      if (data.category) setCategory(data.category);
      if (data.tags && data.tags.length > 0) setTags(data.tags);
      if (data.attachmentUrl) setAttachmentUrl(data.attachmentUrl);
      const amountText = data.amount ? `฿${data.amount.toLocaleString()}` : '';
      const categoryText = data.category || '';
      const details = [amountText, categoryText].filter(Boolean).join(' • ');
      showToast(details ? `Receipt analyzed: ${details}` : 'Receipt analyzed!', 'success');
    } catch (err: unknown) {
      console.error('Receipt analysis error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to analyze receipt';
      showToast(msg || 'Failed to analyze receipt', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleAnalyzeFile(file);
    e.target.value = '';
  };

  const handleViewAttachment = async (key: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/attachments/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch attachment');
      const blob = await res.blob();
      window.open(window.URL.createObjectURL(blob), '_blank');
    } catch (err) {
      console.error('Error viewing attachment:', err);
      showToast('Failed to view attachment', 'error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#0f172a] p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500
            flex items-center justify-center shadow-lg shadow-violet-600/20">
            {isEditing
              ? <Pencil className="w-4 h-4 text-white" />
              : <Plus className="w-4 h-4 text-white" />}
          </span>
          {isEditing ? 'Edit Transaction' : 'New Transaction'}
        </h2>
      </div>

      <div className="space-y-5 flex-1 overflow-y-auto">
        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
          <div className="relative">
            <input
              ref={descriptionInputRef}
              type="text"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
              }}
              placeholder="e.g., Starbucks Coffee"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'description-error' : undefined}
              className={`${inputClass} p-3 pr-10 ${errors.description ? 'border-rose-500' : ''}`}
            />
            <button
              type="button"
              onClick={handleAutoClassify}
              disabled={isThinking || !description}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-violet-400
                hover:text-violet-300 disabled:opacity-40 transition-colors"
              title="Auto-categorize with AI"
            >
              {isThinking
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <Sparkles className="w-5 h-5" />}
            </button>
          </div>
          {errors.description
            ? <p id="description-error" role="alert" className="text-xs text-rose-400 mt-1">{errors.description}</p>
            : !isEditing
              ? <p className="text-xs text-slate-600 mt-1">Type a description then let AI fill the rest.</p>
              : null}
        </div>

        {/* Type Toggle */}
        <div className="flex p-1 bg-white/5 rounded-xl">
          <button
            type="button"
            onClick={() => { setType('expense'); setCategory(ExpenseCategory.OTHER); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all
              ${type === 'expense'
                ? 'bg-[#1e293b] text-rose-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'}`}
          >
            <TrendingDown className="w-4 h-4" />
            Expense
          </button>
          <button
            type="button"
            onClick={() => { setType('income'); setCategory(IncomeCategory.OTHER); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all
              ${type === 'income'
                ? 'bg-[#1e293b] text-emerald-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'}`}
          >
            <TrendingUp className="w-4 h-4" />
            Income
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Amount</label>
            <div className={`flex rounded-xl bg-white/5 overflow-hidden border transition-all
              focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20
              ${errors.amount ? 'border-rose-500' : 'border-white/10'}`}>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                placeholder="0.00"
                aria-invalid={!!errors.amount}
                aria-describedby={errors.amount ? 'amount-error' : undefined}
                className="w-full p-3 bg-transparent text-white border-none outline-none placeholder-slate-500 min-w-0"
              />
              <div className="relative border-l border-white/10">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'THB' | 'USD')}
                  className="h-full pl-2 pr-6 bg-transparent text-slate-300 text-sm font-medium outline-none cursor-pointer appearance-none hover:text-white transition-colors"
                >
                  <option value="THB" className="bg-[#1e293b]">THB</option>
                  <option value="USD" className="bg-[#1e293b]">USD</option>
                </select>
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            {errors.amount
              ? <p id="amount-error" role="alert" className="text-xs text-rose-400 mt-1">{errors.amount}</p>
              : currency === 'USD' && amount
                ? <div className="flex items-center gap-1 mt-1 text-xs text-slate-600">
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>≈ ฿{(parseFloat(amount) * EXCHANGE_RATE).toLocaleString()}</span>
                  </div>
                : null}
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }));
              }}
              aria-invalid={!!errors.date}
              aria-describedby={errors.date ? 'date-error' : undefined}
              className={`${inputClass} p-3 [color-scheme:dark] ${errors.date ? 'border-rose-500' : ''}`}
            />
            {errors.date && (
              <p id="date-error" role="alert" className="text-xs text-rose-400 mt-1">{errors.date}</p>
            )}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className={`${inputClass} p-3`}
            style={{ colorScheme: 'dark' }}
          >
            {type === 'expense'
              ? Object.values(ExpenseCategory).map((cat) => (
                  <option key={cat} value={cat} className="bg-[#1e293b]">{cat}</option>
                ))
              : Object.values(IncomeCategory).map((cat) => (
                  <option key={cat} value={cat} className="bg-[#1e293b]">{cat}</option>
                ))}
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Tags</label>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium
                    bg-violet-500/10 text-violet-300 border border-violet-500/20"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="ml-1.5 hover:text-white transition-colors">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <TagIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <input
              type="text"
              onKeyDown={handleTagInput}
              placeholder="Add tag & press Enter"
              className={`${inputClass} p-2.5 pl-9 text-sm`}
            />
          </div>
        </div>

        {/* Attachment */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Attachment</label>
          <div className="flex items-center gap-2">
            {!attachmentUrl && (
              <button
                type="button"
                onClick={() => setIsAIEnabled(!isAIEnabled)}
                className={`p-3 border-2 rounded-xl transition-all duration-300 ${
                  isAIEnabled
                    ? 'border-violet-500 bg-violet-500/10 text-violet-400 shadow-[0_0_12px_rgba(124,58,237,0.4)]'
                    : 'border-white/10 bg-white/5 text-slate-500 hover:border-violet-500/50 hover:text-violet-400'
                }`}
                title={isAIEnabled ? 'Disable AI Receipt Reading' : 'Enable AI Receipt Reading'}
              >
                <Sparkles className={`w-5 h-5 ${isAIEnabled ? 'fill-violet-400' : ''}`} />
              </button>
            )}

            <label className="flex-1 cursor-pointer">
              <div className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl transition-all duration-300 ${
                isAIEnabled
                  ? 'border-violet-500/50 bg-violet-500/5 text-violet-300 shadow-[0_0_15px_rgba(124,58,237,0.15)]'
                  : 'border-white/10 hover:border-violet-500/40 bg-white/3 text-slate-500 hover:text-slate-300'
              }`}>
                {isUploading || isAnalyzing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                ) : attachmentUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleViewAttachment(attachmentUrl); }}
                      className="p-1 hover:bg-violet-500/10 rounded-full transition-colors z-10"
                      title="View Attachment"
                    >
                      <Paperclip className="w-5 h-5 text-violet-400" />
                    </button>
                    <span className="text-violet-400 font-medium">View</span>
                  </>
                ) : (
                  <>
                    {isAIEnabled
                      ? <Sparkles className="w-5 h-5 text-violet-400" />
                      : <Upload className="w-5 h-5" />}
                    <span className="text-sm">
                      {isAIEnabled ? 'Upload to AI' : 'Upload Receipt'}
                    </span>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                onChange={isAIEnabled ? handleAnalyzeReceipt : handleFileUpload}
                accept={isAIEnabled ? 'image/*' : 'image/*,.pdf'}
                disabled={isUploading || isAnalyzing}
              />
            </label>

            {attachmentUrl && (
              <button
                type="button"
                onClick={() => setAttachmentUrl(undefined)}
                className="p-3 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                title="Remove attachment"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex gap-3 pt-6 pb-2">
        {isEditing && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-sm p-3 rounded-xl
              hover:bg-rose-500/20 transition-colors flex items-center justify-center"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-violet-600 to-indigo-500
            hover:from-violet-500 hover:to-indigo-400
            text-white text-sm p-3 rounded-xl font-semibold transition-all
            shadow-lg shadow-violet-600/20 flex items-center justify-center gap-2"
        >
          {isEditing ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {isEditing ? 'Save Changes' : 'Add Transaction'}
        </button>
      </div>

      {onCancel && (
        <div className="py-2">
          <button
            type="button"
            onClick={onCancel}
            className="w-full text-sm p-3 rounded-xl font-medium text-slate-400
              hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </form>
  );
};

export default ExpenseForm;
