import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: ReactNode;
}

export function PageHeader({ title, onBack, rightAction }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: 'linear-gradient(135deg, #008CE5 0%, #0070B8 100%)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        transform: 'translate3d(0,0,0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
    >
      {/* Overscroll guard — extends blue above the viewport for iOS rubber-band */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: '-200px',
          height: '200px',
          background: 'inherit',
        }}
      />
      <div className="flex items-center px-4 py-3">
        <button
          onClick={onBack || (() => navigate(-1))}
          className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="flex-1 text-center font-bold text-lg text-white truncate px-2">
          {title}
        </h1>
        <div className="min-w-[44px] min-h-[44px] w-11 flex-shrink-0 flex items-center justify-center">
          {rightAction || null}
        </div>
      </div>
    </div>
  );
}
