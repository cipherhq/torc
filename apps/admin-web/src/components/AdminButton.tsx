import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export const AdminButton = forwardRef<HTMLButtonElement, AdminButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, style, ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed';

    const sizeClasses = {
      sm: 'px-3 py-1.5 rounded-lg text-sm',
      md: 'px-5 py-2.5 rounded-xl text-sm',
      lg: 'px-6 py-3 rounded-[20px] text-base',
    };

    const variantStyles = {
      primary: { background: 'linear-gradient(to right, #008CE5, #0070B8)', color: '#FFFFFF' },
      secondary: { backgroundColor: '#F3F4F6', color: '#374151' },
      destructive: { backgroundColor: '#EF4444', color: '#FFFFFF' },
      ghost: { backgroundColor: 'transparent', color: '#4B5563' },
    };

    return (
      <motion.button
        ref={ref as any}
        whileHover={disabled ? undefined : { scale: 1.02 }}
        whileTap={disabled ? undefined : { scale: 0.98 }}
        className={`${baseClasses} ${sizeClasses[size]} ${className}`}
        style={{ ...variantStyles[variant], ...style }}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {children}
      </motion.button>
    );
  }
);

AdminButton.displayName = 'AdminButton';
