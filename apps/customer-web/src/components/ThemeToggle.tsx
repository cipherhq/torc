import { motion } from 'motion/react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ThemeToggle({ size = 'md', className = '' }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  const sizeMap = {
    sm: { button: 'w-9 h-9', icon: 'w-4 h-4' },
    md: { button: 'w-11 h-11', icon: 'w-5 h-5' },
    lg: { button: 'w-14 h-14', icon: 'w-6 h-6' },
  };

  const s = sizeMap[size];

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleTheme}
      className={`${s.button} rounded-full flex items-center justify-center transition-colors ${
        isDark
          ? 'bg-white/10 border border-white/20 text-yellow-400'
          : 'bg-gray-100 border border-gray-200 text-gray-700'
      } ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        key={isDark ? 'moon' : 'sun'}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        exit={{ rotate: 90, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {isDark ? <Moon className={s.icon} /> : <Sun className={s.icon} />}
      </motion.div>
    </motion.button>
  );
}
