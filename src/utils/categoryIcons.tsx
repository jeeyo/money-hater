import {
  ShoppingBag,
  Car,
  Home,
  Zap,
  Film,
  Heart,
  Briefcase,
  GraduationCap,
  Plane,
  HelpCircle,
  ShoppingCart,
  DollarSign,
  Gift,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import { ExpenseCategory, IncomeCategory } from '../types';

export const getCategoryIcon = (category: ExpenseCategory | IncomeCategory) => {
  switch (category) {
    case ExpenseCategory.FOOD:
      return <Utensils className="w-4 h-4 text-orange-500" />;
    case ExpenseCategory.GROCERIES:
      return <ShoppingCart className="w-4 h-4 text-green-500" />;
    case ExpenseCategory.TRANSPORT:
      return <Car className="w-4 h-4 text-blue-500" />;
    case ExpenseCategory.HOUSING:
      return <Home className="w-4 h-4 text-indigo-500" />;
    case ExpenseCategory.UTILITIES:
      return <Zap className="w-4 h-4 text-yellow-500" />;
    case ExpenseCategory.ENTERTAINMENT:
      return <Film className="w-4 h-4 text-pink-500" />;
    case ExpenseCategory.HEALTH:
      return <Heart className="w-4 h-4 text-red-500" />;
    case ExpenseCategory.BUSINESS:
      return <Briefcase className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
    case ExpenseCategory.EDUCATION:
      return <GraduationCap className="w-4 h-4 text-purple-500" />;
    case ExpenseCategory.TRAVEL:
      return <Plane className="w-4 h-4 text-sky-500" />;
    case ExpenseCategory.SHOPPING:
      return <ShoppingBag className="w-4 h-4 text-teal-500" />;

    // Income Categories
    case IncomeCategory.SALARY:
      return <DollarSign className="w-4 h-4 text-green-600" />;
    case IncomeCategory.FREELANCE:
      return <Briefcase className="w-4 h-4 text-blue-600" />;
    case IncomeCategory.INVESTMENT:
      return <TrendingUp className="w-4 h-4 text-purple-600" />;
    case IncomeCategory.GIFT:
      return <Gift className="w-4 h-4 text-pink-500" />;
    case IncomeCategory.OTHER:
      return <DollarSign className="w-4 h-4 text-slate-500" />;

    default:
      return <HelpCircle className="w-4 h-4 text-slate-400" />;
  }
};
