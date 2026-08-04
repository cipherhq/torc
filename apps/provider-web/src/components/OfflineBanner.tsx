import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        backgroundColor: '#EF4444',
        padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px',
        textAlign: 'center',
        animation: 'offlineBannerSlide 0.3s ease-out',
      }}
    >
      <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, margin: 0 }}>
        No internet connection
      </p>
      <style>{`
        @keyframes offlineBannerSlide {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
