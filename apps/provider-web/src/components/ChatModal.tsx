import { X, Send, ArrowLeft, WifiOff, Loader2, AlertTriangle, MapPin, Camera, ImagePlus } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { loadPlatformSettings } from '../lib/platformSettings';
import { formatPrivacyName, formatPrivacyNameFromFull, getDateLabel } from '../lib/nameFormat';
import { encryptMessage, decryptMessage } from '../lib/chatEncryption';

interface Message {
  id: string;
  text: string;
  image?: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'customer' | 'provider' | 'system';
  created_at: string;
  status: 'sending' | 'sent' | 'failed';
}

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  peerName: string;
  peerInitials: string;
  role: 'customer' | 'provider';
  jobStatus?: string;
}

interface ChatSettings {
  maxMessageLength: number;
  messagesPerPage: number;
  historyRetentionDays: number;
  maxImageSizeMb: number;
  enableImages: boolean;
}

const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  maxMessageLength: 1000,
  messagesPerPage: 30,
  historyRetentionDays: 90,
  maxImageSizeMb: 5,
  enableImages: true,
};

const PROVIDER_QUICK_REPLIES = [
  "I'm on my way!",
  "I've arrived",
  "Can you share a photo?",
  "Almost done!",
];

const CUSTOMER_QUICK_REPLIES = [
  "Where are you?",
  "Thank you!",
  "How long will it take?",
];

const STATUS_MESSAGES: Record<string, string> = {
  enroute: 'Provider is on the way',
  en_route: 'Provider is on the way',
  arrived: 'Provider has arrived at your location',
  inprogress: 'Service is now in progress',
  in_progress: 'Service is now in progress',
  completed: 'Service has been completed',
  cancelled: 'This job has been cancelled',
};

const SESSION_ID_KEY = 'torc_chat_session_id';

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

export function ChatModal({ isOpen, onClose, jobId, peerName, peerInitials, role, jobStatus }: ChatModalProps) {
  const { user, profile } = useAuth();
  const { isDark } = useTheme();
  const isJobCompleted = jobStatus === 'completed' || jobStatus === 'cancelled';
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [dbAvailable, setDbAvailable] = useState<boolean | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [chatSettings, setChatSettings] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const senderId = user?.id || getSessionId();
  const myName = profile?.first_name
    ? formatPrivacyName(profile.first_name, profile.last_name, role === 'customer' ? 'Customer' : 'Provider')
    : user?.email?.split('@')[0] || (role === 'customer' ? 'Customer' : 'Provider');

  const quickReplies = role === 'provider' ? PROVIDER_QUICK_REPLIES : CUSTOMER_QUICK_REPLIES;

  // Theme-aware colors
  const bgColor = isDark ? '#081427' : '#FFFFFF';
  const headerBg = isDark ? 'rgba(26,31,46,0.95)' : 'rgba(255,255,255,0.95)';
  const headerBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';
  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subTextColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const inputBg = isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6';
  const inputBorder = isDark ? 'rgba(255,255,255,0.15)' : '#E5E7EB';
  const peerBubbleBg = isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF';
  const peerBubbleText = isDark ? '#FFFFFF' : '#14263D';
  const peerBubbleBorder = isDark ? 'none' : '1px solid #E5E7EB';
  const messageAreaBg = isDark ? 'transparent' : '#F9FAFB';
  const btnBg = isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6';
  const closeBtnColor = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const myBubbleTimestamp = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.7)';
  const peerBubbleTimestamp = isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF';

  // Load settings
  useEffect(() => {
    loadPlatformSettings().then((s) => {
      setChatSettings({
        maxMessageLength: s.chat_max_message_length || 1000,
        messagesPerPage: s.chat_messages_per_page || 30,
        historyRetentionDays: s.chat_history_retention_days || 90,
        maxImageSizeMb: s.chat_max_image_size_mb || 5,
        enableImages: s.chat_enable_images !== false,
      });
    });
  }, []);

  // Load message history
  const loadHistory = useCallback(async (before?: string) => {
    if (!jobId) return;
    const isInitial = !before;
    if (isInitial) setIsLoadingHistory(true);
    else setLoadingOlder(true);

    try {
      const retentionCutoff = new Date();
      retentionCutoff.setDate(retentionCutoff.getDate() - chatSettings.historyRetentionDays);

      let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('job_id', jobId)
        .gte('created_at', retentionCutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(chatSettings.messagesPerPage);

      if (before) {
        query = query.lt('created_at', before);
      }

      const { data, error } = await query;

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setDbAvailable(false);
        } else {
          console.warn('Chat history load error:', error.message);
          setDbAvailable(false);
        }
      } else {
        setDbAvailable(true);
        const rows = (data || []).reverse();
        const mapped: Message[] = await Promise.all(rows.map(async (row: any) => ({
          id: row.id,
          text: await decryptMessage(jobId, row.message),
          image: row.image_url || undefined,
          sender_id: row.sender_id,
          sender_name: formatPrivacyNameFromFull(row.sender_name, row.sender_role === 'customer' ? 'Customer' : 'Provider'),
          sender_role: row.sender_role,
          created_at: row.created_at,
          status: 'sent' as const,
        })));

        if (isInitial) {
          setMessages(mapped);
        } else {
          const container = messagesContainerRef.current;
          const prevHeight = container?.scrollHeight || 0;
          setMessages((prev) => [...mapped, ...prev]);
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight - prevHeight;
            }
          });
        }
        setHasOlderMessages((data || []).length === chatSettings.messagesPerPage);
      }
    } catch {
      setDbAvailable(false);
    } finally {
      if (isInitial) setIsLoadingHistory(false);
      else setLoadingOlder(false);
    }
  }, [jobId, chatSettings]);

  // Subscribe to realtime
  useEffect(() => {
    if (!isOpen || !jobId) return;
    loadHistory();

    const channel = supabase.channel(`chat-${jobId}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on('broadcast', { event: 'new_message' }, async (payload) => {
        const msg = payload.payload as Message;
        const decryptedText = await decryptMessage(jobId, msg.text);
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg, text: decryptedText, status: 'sent' }];
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setIsConnected(true);
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [isOpen, jobId, loadHistory]);

  // Subscribe to job status changes for system messages
  useEffect(() => {
    if (!isOpen || !jobId) return;

    const statusChannel = supabase
      .channel(`job-status-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      }, (payload: any) => {
        const newStatus = payload.new?.status;
        const oldStatus = payload.old?.status;
        if (newStatus && newStatus !== oldStatus && STATUS_MESSAGES[newStatus]) {
          setMessages((prev) => [...prev, {
            id: `system-${Date.now()}`,
            text: STATUS_MESSAGES[newStatus],
            sender_id: 'system',
            sender_name: 'TORC',
            sender_role: 'system' as any,
            created_at: new Date().toISOString(),
            status: 'sent',
          }]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(statusChannel); };
  }, [isOpen, jobId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  // Save message to DB
  const saveToDb = useCallback(async (msg: Message) => {
    if (dbAvailable === false) return;
    try {
      const { error } = await supabase.from('chat_messages').insert({
        id: msg.id,
        job_id: jobId,
        sender_id: msg.sender_id,
        sender_name: msg.sender_name,
        sender_role: msg.sender_role,
        message: msg.text,
        image_url: msg.image || null,
        created_at: msg.created_at,
      });
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) setDbAvailable(false);
        console.warn('Save message error:', error.message);
      }
    } catch { /* silently fail */ }
  }, [jobId, dbAvailable]);

  const broadcastAndSave = useCallback(async (msg: Message) => {
    // Encrypt the message text before sending over the wire / saving to DB
    const encryptedText = await encryptMessage(jobId, msg.text);
    const encMsg = { ...msg, text: encryptedText };

    if (channelRef.current) {
      try {
        await channelRef.current.send({ type: 'broadcast', event: 'new_message', payload: encMsg });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'sent' as const } : m)));

        const peerRole = role === 'customer' ? 'provider' : 'customer';
        const notifyChannel = supabase.channel(`chat-notify-${peerRole}-${jobId}`);
        notifyChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            notifyChannel.send({ type: 'broadcast', event: 'new_message', payload: encMsg }).catch(() => {});
            setTimeout(() => supabase.removeChannel(notifyChannel), 2000);
          }
        });
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'failed' as const } : m)));
      }
    } else {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'sent' as const } : m)));
    }
    saveToDb(encMsg);
  }, [role, jobId, saveToDb]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || inputText).trim();
    if (!text) return;

    const msgId = `${senderId}-${Date.now()}`;
    const now = new Date().toISOString();
    const msg: Message = {
      id: msgId,
      text,
      sender_id: senderId,
      sender_name: myName,
      sender_role: role,
      created_at: now,
      status: 'sending',
    };

    setMessages((prev) => [...prev, msg]);
    if (!overrideText) setInputText('');
    await broadcastAndSave(msg);
  }, [inputText, senderId, myName, role, broadcastAndSave]);

  const handleImageSelected = useCallback(async (file: File) => {
    setShowAttachMenu(false);

    if (file.size > chatSettings.maxImageSizeMb * 1024 * 1024) {
      alert(`Image must be under ${chatSettings.maxImageSizeMb}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;

      const msgId = `${senderId}-img-${Date.now()}`;
      const now = new Date().toISOString();
      const msg: Message = {
        id: msgId, text: '', image: dataUrl, sender_id: senderId,
        sender_name: myName, sender_role: role, created_at: now, status: 'sending',
      };

      setMessages((prev) => [...prev, msg]);
      await broadcastAndSave(msg);
    };
    reader.readAsDataURL(file);
  }, [senderId, myName, role, broadcastAndSave, chatSettings]);

  const retryMessage = useCallback(async (msg: Message) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'sending' as const } : m)));
    if (channelRef.current) {
      try {
        await channelRef.current.send({ type: 'broadcast', event: 'new_message', payload: msg });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'sent' as const } : m)));
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'failed' as const } : m)));
      }
    }
    saveToDb(msg);
  }, [saveToDb]);

  const shareLocation = useCallback(() => {
    import('../utils/safeLocation').then(({ getSafePosition }) => {
      getSafePosition().then((pos) => {
        const text = `My current location: https://maps.google.com/maps?q=${pos.lat},${pos.lng}`;
        sendMessage(text);
      });
    });
  }, [sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!isOpen) return null;

  const chatUI = (
    <div id="torc-chat-overlay" style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      zIndex: 99999, display: 'flex', flexDirection: 'column',
      background: bgColor, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px', paddingTop: 'calc(env(safe-area-inset-top, 16px) + 16px)',
        display: 'flex', alignItems: 'center', gap: '12px',
        borderBottom: `1px solid ${headerBorder}`, background: headerBg,
        backdropFilter: 'blur(20px)', flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          borderRadius: '50%', padding: '8px', background: btnBg,
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} aria-label="Go back">
          <ArrowLeft style={{ width: 20, height: 20, color: textColor }} />
        </button>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'linear-gradient(135deg, #008CE5, #0070B8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>{peerInitials}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ color: textColor, fontWeight: 600, fontSize: 14, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peerName}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22C55E' : (isDark ? 'rgba(255,255,255,0.3)' : '#D1D5DB') }} />
            <span style={{ color: subTextColor, fontSize: 12 }}>{isConnected ? 'Online' : 'Connecting...'}</span>
          </div>
        </div>
        {/* Share location */}
        <button onClick={shareLocation} style={{
          borderRadius: '50%', padding: '8px', background: btnBg,
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} aria-label="Share location">
          <MapPin style={{ width: 18, height: 18, color: '#008CE5' }} />
        </button>
        <button onClick={onClose} style={{
          borderRadius: '50%', padding: '8px', background: btnBg,
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} aria-label="Close chat">
          <X style={{ width: 20, height: 20, color: closeBtnColor }} />
        </button>
      </div>

      {/* Messages area */}
      <div ref={messagesContainerRef} style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '8px',
        backgroundColor: messageAreaBg,
      }}>
        {/* Load older */}
        {hasOlderMessages && !isLoadingHistory && (
          <button onClick={() => { const oldest = messages[0]?.created_at; if (oldest) loadHistory(oldest); }}
            disabled={loadingOlder}
            style={{
              alignSelf: 'center', padding: '8px 16px', borderRadius: 9999,
              background: btnBg, border: 'none', color: '#008CE5',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
            }}>
            {loadingOlder ? 'Loading...' : 'Load older messages'}
          </button>
        )}

        {isLoadingHistory && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <Loader2 style={{ width: 24, height: 24, color: subTextColor }} className="animate-spin" />
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', padding: '0 32px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: btnBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Send style={{ width: 28, height: 28, color: subTextColor }} />
            </div>
            <p style={{ color: subTextColor, fontSize: 14, marginBottom: 4 }}>No messages yet</p>
            <p style={{ color: isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF', fontSize: 12 }}>
              Send a message to {peerName} about your service request
            </p>
          </div>
        )}

        {(() => {
          const completedIdx = messages.findIndex((m) => m.sender_id === 'system' && (m.text === STATUS_MESSAGES.completed || m.text === STATUS_MESSAGES.cancelled));
          return messages.map((msg, index) => {
          const isMe = msg.sender_id === senderId;
          const isSystem = msg.sender_id === 'system';
          const showDateSep = index === 0 || getDateLabel(msg.created_at) !== getDateLabel(messages[index - 1].created_at);
          const isPostCompletion = !isSystem && completedIdx >= 0 && index > completedIdx;

          return (
            <React.Fragment key={msg.id}>
              {showDateSep && (
                <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 600, color: subTextColor }}>
                  {getDateLabel(msg.created_at)}
                </div>
              )}

              {isSystem ? (
                <div style={{ textAlign: 'center', padding: '4px 0' }}>
                  <span style={{
                    fontSize: 11, color: subTextColor,
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                    padding: '4px 12px', borderRadius: 9999,
                  }}>{msg.text}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%', borderRadius: 16,
                    padding: msg.image && !msg.text ? '4px' : '10px 16px',
                    background: isMe ? 'linear-gradient(90deg, #008CE5, #0070B8)' : peerBubbleBg,
                    color: isMe ? '#FFFFFF' : peerBubbleText,
                    border: isMe ? 'none' : peerBubbleBorder,
                    boxShadow: isMe ? 'none' : (isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.06)'),
                    overflow: 'hidden',
                  }}>
                    {!isMe && (
                      <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, color: '#008CE5', margin: msg.image ? '6px 12px 2px' : '0 0 2px 0' }}>{msg.sender_name}</p>
                    )}
                    {msg.image && (
                      <img src={msg.image} alt="Shared photo" style={{
                        width: '100%', maxWidth: 240, borderRadius: msg.text ? '8px' : '12px',
                        display: 'block', margin: msg.text ? '4px 0 8px' : '0', cursor: 'pointer',
                      }} onClick={() => {
                        const win = window.open();
                        if (win) win.document.write(`<img src="${msg.image}" style="max-width:100%;max-height:100vh;margin:auto;display:block;" />`);
                      }} />
                    )}
                    {msg.text && (
                      <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, padding: msg.image && !msg.text ? '0 12px' : 0 }}>{msg.text}</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: isMe ? 'flex-end' : 'flex-start', padding: msg.image && !msg.text ? '0 8px 4px' : 0 }}>
                      <span style={{ fontSize: 10, color: isMe ? myBubbleTimestamp : peerBubbleTimestamp }}>
                        {formatTime(msg.created_at)}
                      </span>
                      {isMe && msg.status === 'sending' && (
                        <Loader2 style={{ width: 12, height: 12, color: myBubbleTimestamp }} className="animate-spin" />
                      )}
                      {isMe && msg.status === 'failed' && (
                        <button onClick={() => retryMessage(msg)} style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          <WifiOff style={{ width: 12, height: 12, color: '#dc2626' }} />
                          <span style={{ fontSize: 10, color: '#dc2626', textDecoration: 'underline' }}>Retry</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {isPostCompletion && (
                    <span style={{ fontSize: 10, color: '#D97706', marginTop: 2, fontStyle: 'italic' }}>
                      Sent outside service period
                    </span>
                  )}
                </div>
              )}
            </React.Fragment>
          );
          });
        })()}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick replies */}
      {!isJobCompleted && messages.length < 3 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 16px', flexShrink: 0, borderTop: `1px solid ${headerBorder}`, background: headerBg }}>
          {quickReplies.map((text) => (
            <button key={text} onClick={() => sendMessage(text)}
              style={{
                padding: '6px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 500,
                background: isDark ? 'rgba(0,140,229,0.15)' : 'rgba(0,140,229,0.08)',
                color: '#008CE5', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
              {text}
            </button>
          ))}
        </div>
      )}

      {/* Post-service warning banner */}
      {isJobCompleted && (
        <div style={{
          padding: '8px 16px', borderTop: `1px solid ${isDark ? 'rgba(217,119,6,0.3)' : '#FDE68A'}`,
          background: isDark ? 'rgba(217,119,6,0.1)' : '#FFFBEB', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle style={{ width: 16, height: 16, color: '#D97706', flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: isDark ? '#FBBF24' : '#92400E', margin: 0 }}>
            Service has ended. Messages are sent outside the service period.
          </p>
        </div>
      )}

      {/* Input area */}
      <div style={{
        padding: '12px 16px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)',
        borderTop: `1px solid ${headerBorder}`, background: headerBg,
        backdropFilter: 'blur(20px)', flexShrink: 0, position: 'relative',
      }}>
        {/* Attachment menu */}
        {showAttachMenu && chatSettings.enableImages && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 8,
            background: isDark ? '#14263D' : '#FFFFFF', borderRadius: 16,
            border: `1px solid ${headerBorder}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'flex', gap: 8,
          }}>
            <button onClick={async () => {
              try {
                const perms = await CapCamera.requestPermissions({ permissions: ['camera', 'photos'] });
                if (perms.camera === 'denied' && perms.photos === 'denied') {
                  alert('Camera and photo permissions are required. Please enable them in Settings.');
                  return;
                }
                const image = await CapCamera.getPhoto({
                  quality: 80,
                  allowEditing: false,
                  resultType: CameraResultType.DataUrl,
                  source: CameraSource.Camera,
                  promptLabelHeader: 'Take Photo',
                });
                if (image.dataUrl) {
                  setShowAttachMenu(false);
                  const blob = await fetch(image.dataUrl).then(r => r.blob());
                  const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
                  handleImageSelected(file);
                }
              } catch (err: any) {
                const msg = err?.message || '';
                if (msg.includes('cancelled') || msg.includes('canceled') || msg.includes('User cancelled')) return;
                console.warn('Camera error:', err);
                cameraInputRef.current?.click();
              }
            }} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '12px 8px', borderRadius: 12, background: isDark ? 'rgba(0,140,229,0.15)' : 'rgba(0,140,229,0.06)',
              border: `1px solid ${isDark ? 'rgba(0,140,229,0.3)' : 'rgba(0,140,229,0.15)'}`, cursor: 'pointer',
            }}>
              <Camera style={{ width: 22, height: 22, color: '#008CE5' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#0070B8' }}>Camera</span>
            </button>
            <button onClick={async () => {
              try {
                const perms = await CapCamera.requestPermissions({ permissions: ['photos'] });
                if (perms.photos === 'denied') {
                  alert('Photo library permission is required. Please enable it in Settings.');
                  return;
                }
                const image = await CapCamera.getPhoto({
                  quality: 80,
                  allowEditing: false,
                  resultType: CameraResultType.DataUrl,
                  source: CameraSource.Photos,
                  promptLabelHeader: 'Choose Photo',
                });
                if (image.dataUrl) {
                  setShowAttachMenu(false);
                  const blob = await fetch(image.dataUrl).then(r => r.blob());
                  const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
                  handleImageSelected(file);
                }
              } catch (err: any) {
                const msg = err?.message || '';
                if (msg.includes('cancelled') || msg.includes('canceled') || msg.includes('User cancelled')) return;
                console.warn('Gallery error:', err);
                galleryInputRef.current?.click();
              }
            }} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '12px 8px', borderRadius: 12, background: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
              border: `1px solid ${headerBorder}`, cursor: 'pointer',
            }}>
              <ImagePlus style={{ width: 22, height: 22, color: subTextColor }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: subTextColor }}>Gallery</span>
            </button>
          </div>
        )}

        {/* Hidden file inputs */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageSelected(file); e.target.value = ''; }} />
        <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageSelected(file); e.target.value = ''; }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {chatSettings.enableImages && (
            <button onClick={() => setShowAttachMenu(!showAttachMenu)} style={{
              width: 44, height: 44, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: showAttachMenu ? 'linear-gradient(90deg, #008CE5, #0070B8)' : btnBg,
              border: 'none', cursor: 'pointer',
            }} aria-label="Attach photo">
              <Camera style={{ width: 20, height: 20, color: showAttachMenu ? '#FFFFFF' : subTextColor }} />
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => {
              if (e.target.value.length <= chatSettings.maxMessageLength) {
                setInputText(e.target.value);
                setShowAttachMenu(false);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            style={{
              flex: 1, background: inputBg, border: `1px solid ${inputBorder}`,
              borderRadius: 9999, padding: '12px 16px', color: textColor,
              fontSize: 16, outline: 'none',
            }}
          />
          <button onClick={() => sendMessage()} disabled={!inputText.trim()}
            style={{
              width: 44, height: 44, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: inputText.trim() ? 'linear-gradient(90deg, #008CE5, #0070B8)' : btnBg,
              border: 'none', cursor: inputText.trim() ? 'pointer' : 'default',
            }} aria-label="Send message">
            <Send style={{ width: 20, height: 20, color: inputText.trim() ? '#FFFFFF' : subTextColor }} />
          </button>
        </div>
        {/* Character counter */}
        {inputText.length > chatSettings.maxMessageLength * 0.8 && (
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <span style={{
              fontSize: 10,
              color: inputText.length >= chatSettings.maxMessageLength ? '#dc2626' : subTextColor,
            }}>
              {inputText.length}/{chatSettings.maxMessageLength}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(chatUI, document.body);
}
