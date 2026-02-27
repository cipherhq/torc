import { X, Send, ArrowLeft, WifiOff, Loader2, CheckCircle, Camera, ImagePlus, MapPin } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { loadPlatformSettings } from '../lib/platformSettings';
import { formatPrivacyName, formatPrivacyNameFromFull, getDateLabel } from '../lib/nameFormat';

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

const CUSTOMER_QUICK_REPLIES = [
  "Where are you?",
  "Thank you!",
  "How long will it take?",
];

const PROVIDER_QUICK_REPLIES = [
  "I'm on my way!",
  "I've arrived",
  "Can you share a photo?",
  "Almost done!",
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

  const isJobCompleted = jobStatus === 'completed' || jobStatus === 'cancelled';
  const senderId = user?.id || getSessionId();
  const myName = profile?.first_name
    ? formatPrivacyName(profile.first_name, profile.last_name, role === 'customer' ? 'Customer' : 'Provider')
    : user?.email?.split('@')[0] || (role === 'customer' ? 'Customer' : 'Provider');

  const quickReplies = role === 'customer' ? CUSTOMER_QUICK_REPLIES : PROVIDER_QUICK_REPLIES;

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
        const mapped: Message[] = (data || []).reverse().map((row: any) => ({
          id: row.id,
          text: row.message,
          image: row.image_url || undefined,
          sender_id: row.sender_id,
          sender_name: formatPrivacyNameFromFull(row.sender_name, row.sender_role === 'customer' ? 'Customer' : 'Provider'),
          sender_role: row.sender_role,
          created_at: row.created_at,
          status: 'sent' as const,
        }));

        if (isInitial) {
          setMessages(mapped);
        } else {
          const container = messagesContainerRef.current;
          const prevHeight = container?.scrollHeight || 0;
          setMessages((prev) => [...mapped, ...prev]);
          requestAnimationFrame(() => {
            if (container) container.scrollTop = container.scrollHeight - prevHeight;
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
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const msg = payload.payload as Message;
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg, status: 'sent' }];
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

  // Subscribe to job status changes
  useEffect(() => {
    if (!isOpen || !jobId) return;
    const statusChannel = supabase
      .channel(`job-status-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}`,
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

  // Scroll to bottom
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
        id: msg.id, job_id: jobId, sender_id: msg.sender_id,
        sender_name: msg.sender_name, sender_role: msg.sender_role,
        message: msg.text, image_url: msg.image || null, created_at: msg.created_at,
      });
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) setDbAvailable(false);
        console.warn('Save message error:', error.message);
      }
    } catch { /* silently fail */ }
  }, [jobId, dbAvailable]);

  const broadcastAndSave = useCallback(async (msg: Message) => {
    if (channelRef.current) {
      try {
        await channelRef.current.send({ type: 'broadcast', event: 'new_message', payload: msg });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'sent' as const } : m)));

        const peerRole = role === 'customer' ? 'provider' : 'customer';
        const notifyChannel = supabase.channel(`chat-notify-${peerRole}-${jobId}`);
        notifyChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            notifyChannel.send({ type: 'broadcast', event: 'new_message', payload: msg }).catch(() => {});
            setTimeout(() => supabase.removeChannel(notifyChannel), 2000);
          }
        });
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'failed' as const } : m)));
      }
    } else {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, status: 'sent' as const } : m)));
    }
    saveToDb(msg);
  }, [role, jobId, saveToDb]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || inputText).trim();
    if (!text) return;

    const msgId = `${senderId}-${Date.now()}`;
    const now = new Date().toISOString();
    const msg: Message = {
      id: msgId, text, sender_id: senderId, sender_name: myName,
      sender_role: role, created_at: now, status: 'sending',
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
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      sendMessage(`My current location: https://maps.google.com/maps?q=${latitude},${longitude}`);
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
      background: '#FFFFFF', overflow: 'hidden',
      WebkitOverflowScrolling: 'touch' as any, touchAction: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px', paddingTop: 'calc(env(safe-area-inset-top, 16px) + 16px)',
        display: 'flex', alignItems: 'center', gap: '12px',
        borderBottom: '1px solid #E5E7EB', background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px)', flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          borderRadius: '50%', padding: '8px', background: '#F3F4F6',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'manipulation',
        }} aria-label="Go back">
          <ArrowLeft style={{ width: 20, height: 20, color: '#14263D' }} />
        </button>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'linear-gradient(135deg, #008CE5, #0070B8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>{peerInitials}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ color: '#14263D', fontWeight: 600, fontSize: 14, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peerName}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22C55E' : '#D1D5DB' }} />
            <span style={{ color: '#6B7280', fontSize: 12 }}>{isConnected ? 'Online' : 'Connecting...'}</span>
          </div>
        </div>
        <button onClick={shareLocation} style={{
          borderRadius: '50%', padding: '8px', background: '#F3F4F6',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'manipulation',
        }} aria-label="Share location">
          <MapPin style={{ width: 18, height: 18, color: '#008CE5' }} />
        </button>
        <button onClick={onClose} style={{
          borderRadius: '50%', padding: '8px', background: '#F3F4F6',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'manipulation',
        }} aria-label="Close chat">
          <X style={{ width: 20, height: 20, color: '#6B7280' }} />
        </button>
      </div>

      {/* Messages area */}
      <div ref={messagesContainerRef} style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '8px',
        backgroundColor: '#F9FAFB', WebkitOverflowScrolling: 'touch' as any,
      }}>
        {/* Load older */}
        {hasOlderMessages && !isLoadingHistory && (
          <button onClick={() => { const oldest = messages[0]?.created_at; if (oldest) loadHistory(oldest); }}
            disabled={loadingOlder}
            style={{
              alignSelf: 'center', padding: '8px 16px', borderRadius: 9999,
              background: '#F3F4F6', border: 'none', color: '#008CE5',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
            }}>
            {loadingOlder ? 'Loading...' : 'Load older messages'}
          </button>
        )}

        {isLoadingHistory && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <Loader2 style={{ width: 24, height: 24, color: '#9CA3AF' }} className="animate-spin" />
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', padding: '0 32px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Send style={{ width: 28, height: 28, color: '#9CA3AF' }} />
            </div>
            <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 4 }}>No messages yet</p>
            <p style={{ color: '#9CA3AF', fontSize: 12 }}>Send a message to {peerName} about your service request</p>
          </div>
        )}

        {messages.map((msg, index) => {
          const isMe = msg.sender_id === senderId;
          const isSystem = msg.sender_id === 'system';
          const showDateSep = index === 0 || getDateLabel(msg.created_at) !== getDateLabel(messages[index - 1].created_at);

          return (
            <React.Fragment key={msg.id}>
              {showDateSep && (
                <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>
                  {getDateLabel(msg.created_at)}
                </div>
              )}

              {isSystem ? (
                <div style={{ textAlign: 'center', padding: '4px 0' }}>
                  <span style={{
                    fontSize: 11, color: '#6B7280',
                    background: 'rgba(0,0,0,0.05)', padding: '4px 12px', borderRadius: 9999,
                  }}>{msg.text}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%', borderRadius: 16,
                    padding: msg.image && !msg.text ? '4px' : '10px 16px',
                    background: isMe ? 'linear-gradient(90deg, #008CE5, #0070B8)' : '#FFFFFF',
                    color: isMe ? '#FFFFFF' : '#14263D',
                    boxShadow: isMe ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
                    border: isMe ? 'none' : '1px solid #E5E7EB',
                    overflow: 'hidden',
                  }}>
                    {!isMe && (
                      <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, color: '#008CE5', margin: msg.image ? '6px 12px 2px' : '0 0 2px 0' }}>{msg.sender_name}</p>
                    )}
                    {msg.image && (
                      <img src={msg.image} alt="Shared photo" style={{
                        width: '100%', maxWidth: 240, borderRadius: msg.text ? '8px' : '12px',
                        display: 'block', margin: msg.text ? '4px 0 8px' : '0',
                      }} onClick={() => {
                        const win = window.open();
                        if (win) win.document.write(`<img src="${msg.image}" style="max-width:100%;max-height:100vh;margin:auto;display:block;" />`);
                      }} />
                    )}
                    {msg.text && (
                      <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, padding: msg.image && !msg.text ? '0 12px' : 0 }}>{msg.text}</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: isMe ? 'flex-end' : 'flex-start', padding: msg.image && !msg.text ? '0 8px 4px' : 0 }}>
                      <span style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.7)' : '#9CA3AF' }}>
                        {formatTime(msg.created_at)}
                      </span>
                      {isMe && msg.status === 'sending' && (
                        <Loader2 style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.6)' }} className="animate-spin" />
                      )}
                      {isMe && msg.status === 'failed' && (
                        <button onClick={() => retryMessage(msg)} style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0, touchAction: 'manipulation' }}>
                          <WifiOff style={{ width: 12, height: 12, color: '#dc2626' }} />
                          <span style={{ fontSize: 10, color: '#dc2626', textDecoration: 'underline' }}>Retry</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick replies */}
      {!isJobCompleted && messages.length < 3 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 16px', flexShrink: 0, borderTop: '1px solid #E5E7EB', background: '#FFFFFF' }}>
          {quickReplies.map((text) => (
            <button key={text} onClick={() => sendMessage(text)}
              style={{
                padding: '6px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 500,
                background: 'rgba(0,140,229,0.08)', color: '#008CE5',
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                touchAction: 'manipulation',
              }}>
              {text}
            </button>
          ))}
        </div>
      )}

      {/* Input area or completion banner */}
      {isJobCompleted ? (
        <div style={{
          padding: '16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)',
          borderTop: '1px solid #E5E7EB', background: '#FFFFFF', flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 16,
            background: jobStatus === 'completed' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${jobStatus === 'completed' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <CheckCircle style={{ width: 22, height: 22, color: jobStatus === 'completed' ? '#22C55E' : '#EF4444', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#14263D', margin: 0 }}>
                {jobStatus === 'completed' ? 'Service Completed' : 'Service Cancelled'}
              </p>
              <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0 0' }}>
                This conversation has ended. Thank you for using TORC.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '12px 16px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)',
          borderTop: '1px solid #E5E7EB', background: '#FFFFFF', flexShrink: 0, position: 'relative',
        }}>
          {/* Attachment menu */}
          {showAttachMenu && chatSettings.enableImages && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 8,
              background: '#FFFFFF', borderRadius: 16, border: '1px solid #E5E7EB',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'flex', gap: 8,
            }}>
              <button onClick={() => cameraInputRef.current?.click()} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '12px 8px', borderRadius: 12, background: 'rgba(0,140,229,0.06)',
                border: '1px solid rgba(0,140,229,0.15)', cursor: 'pointer', touchAction: 'manipulation',
              }}>
                <Camera style={{ width: 22, height: 22, color: '#008CE5' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#0070B8' }}>Camera</span>
              </button>
              <button onClick={() => galleryInputRef.current?.click()} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '12px 8px', borderRadius: 12, background: '#F9FAFB',
                border: '1px solid #E5E7EB', cursor: 'pointer', touchAction: 'manipulation',
              }}>
                <ImagePlus style={{ width: 22, height: 22, color: '#6B7280' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>Gallery</span>
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
                width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: showAttachMenu ? 'linear-gradient(90deg, #008CE5, #0070B8)' : '#F3F4F6',
                border: 'none', cursor: 'pointer', touchAction: 'manipulation',
              }} aria-label="Attach photo">
                <Camera style={{ width: 20, height: 20, color: showAttachMenu ? '#FFFFFF' : '#6B7280' }} />
              </button>
            )}

            <input ref={inputRef} type="text" inputMode="text" autoComplete="off" autoCorrect="on" enterKeyHint="send"
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
                flex: 1, background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 9999,
                padding: '12px 16px', color: '#14263D', fontSize: 16, outline: 'none',
                WebkitAppearance: 'none' as any, WebkitUserSelect: 'text' as any, userSelect: 'text' as any, touchAction: 'manipulation',
              }}
            />
            <button onClick={() => sendMessage()} disabled={!inputText.trim()} style={{
              width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: inputText.trim() ? 'linear-gradient(90deg, #008CE5, #0070B8)' : '#F3F4F6',
              border: 'none', cursor: inputText.trim() ? 'pointer' : 'default', touchAction: 'manipulation',
            }} aria-label="Send message">
              <Send style={{ width: 20, height: 20, color: inputText.trim() ? '#FFFFFF' : '#9CA3AF' }} />
            </button>
          </div>
          {/* Character counter */}
          {inputText.length > chatSettings.maxMessageLength * 0.8 && (
            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <span style={{
                fontSize: 10,
                color: inputText.length >= chatSettings.maxMessageLength ? '#dc2626' : '#9CA3AF',
              }}>
                {inputText.length}/{chatSettings.maxMessageLength}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(chatUI, document.body);
}
