import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, X, Info, Bell, MessageCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'notification' | 'message';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onTap?: () => void;
}

let toastListeners: ((toast: Toast) => void)[] = [];

export function showToast(type: ToastType, title: string, message?: string, duration = 4000, onTap?: () => void) {
  const toast: Toast = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    title,
    message,
    duration,
    onTap,
  };
  toastListeners.forEach((fn) => fn(toast));
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  notification: Bell,
  message: MessageCircle,
};

const colorMap = {
  success: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', icon: '#22C55E' },
  error: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', icon: '#EF4444' },
  info: { bg: 'rgba(78,205,196,0.08)', border: 'rgba(78,205,196,0.2)', icon: '#008CE5' },
  notification: { bg: 'rgba(78,205,196,0.08)', border: 'rgba(78,205,196,0.2)', icon: '#008CE5' },
  message: { bg: 'rgba(42,157,143,0.1)', border: 'rgba(42,157,143,0.3)', icon: '#0070B8' },
};

export function NotificationToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Toast) => {
    setToasts((prev) => [...prev.slice(-4), toast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    toastListeners.push(addToast);
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== addToast);
    };
  }, [addToast]);

  useEffect(() => {
    toasts.forEach((toast) => {
      const timer = setTimeout(() => removeToast(toast.id), toast.duration || 4000);
      return () => clearTimeout(timer);
    });
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 16px) + 8px)',
        left: 12,
        right: 12,
        zIndex: 99998,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        const colors = colorMap[toast.type];
        const isMessage = toast.type === 'message';
        return (
          <div
            key={toast.id}
            onClick={() => {
              if (toast.onTap) {
                toast.onTap();
                removeToast(toast.id);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: isMessage ? '14px 16px' : '12px 14px',
              borderRadius: 16,
              backgroundColor: '#FFFFFF',
              border: `1.5px solid ${colors.border}`,
              boxShadow: isMessage ? '0 12px 40px rgba(0,0,0,0.16)' : '0 8px 32px rgba(0,0,0,0.12)',
              pointerEvents: 'auto',
              animation: 'toastSlideIn 0.3s ease-out',
              cursor: toast.onTap ? 'pointer' : 'default',
            }}
          >
            <div
              style={{
                width: isMessage ? 42 : 36,
                height: isMessage ? 42 : 36,
                borderRadius: isMessage ? 21 : 10,
                backgroundColor: colors.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon style={{ width: isMessage ? 20 : 18, height: isMessage ? 20 : 18, color: colors.icon }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: isMessage ? 15 : 14, fontWeight: 600, color: '#14263D', margin: 0 }}>
                {toast.title}
              </p>
              {toast.message && (
                <p style={{ fontSize: 13, color: '#6B7280', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {toast.message}
                </p>
              )}
              {isMessage && (
                <p style={{ fontSize: 11, color: '#0070B8', fontWeight: 600, margin: '4px 0 0 0' }}>Tap to reply</p>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }}
              style={{
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                flexShrink: 0,
                touchAction: 'manipulation',
              }}
            >
              <X style={{ width: 16, height: 16, color: '#9CA3AF' }} />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}
