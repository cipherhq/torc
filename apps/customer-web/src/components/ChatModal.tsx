import { X, Send, ArrowLeft, WifiOff, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface Message {
  id: string;
  text: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'customer' | 'provider';
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
}

const SESSION_ID_KEY = 'torc_chat_session_id';

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

export function ChatModal({ isOpen, onClose, jobId, peerName, peerInitials, role }: ChatModalProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [dbAvailable, setDbAvailable] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const senderId = user?.id || getSessionId();
  const myName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : user?.email?.split('@')[0] || (role === 'customer' ? 'Customer' : 'Provider');

  // Load message history from database
  const loadHistory = useCallback(async () => {
    if (!jobId) return;
    setIsLoadingHistory(true);

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setDbAvailable(false);
        } else {
          console.warn('Chat history load error:', error.message);
          setDbAvailable(false);
        }
      } else {
        setDbAvailable(true);
        if (data && data.length > 0) {
          const mapped: Message[] = data.map((row: any) => ({
            id: row.id,
            text: row.message,
            sender_id: row.sender_id,
            sender_name: row.sender_name,
            sender_role: row.sender_role,
            created_at: row.created_at,
            status: 'sent' as const,
          }));
          setMessages(mapped);
        }
      }
    } catch {
      setDbAvailable(false);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [jobId]);

  // Subscribe to realtime channel for live messages
  useEffect(() => {
    if (!isOpen || !jobId) return;

    loadHistory();

    const channelName = `chat-${jobId}`;
    const channel = supabase.channel(channelName, {
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
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [isOpen, jobId, loadHistory]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Save message to database (best-effort)
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
        created_at: msg.created_at,
      });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setDbAvailable(false);
        }
        console.warn('Save message error:', error.message);
      }
    } catch {
      // silently fail
    }
  }, [jobId, dbAvailable]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
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

    // Optimistic update -- show message immediately
    setMessages((prev) => [...prev, msg]);
    setInputText('');

    // Broadcast via Supabase Realtime
    if (channelRef.current) {
      try {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'new_message',
          payload: msg,
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'sent' as const } : m))
        );
      } catch (err) {
        console.warn('Broadcast error:', err);
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'failed' as const } : m))
        );
      }
    } else {
      // No channel, mark as sent anyway (local-only)
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, status: 'sent' as const } : m))
      );
    }

    // Persist to database in background
    saveToDb(msg);
  }, [inputText, senderId, myName, role, saveToDb]);

  const retryMessage = useCallback(async (msg: Message) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, status: 'sending' as const } : m))
    );

    if (channelRef.current) {
      try {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'new_message',
          payload: msg,
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, status: 'sent' as const } : m))
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, status: 'failed' as const } : m))
        );
      }
    }
    saveToDb(msg);
  }, [saveToDb]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  const chatUI = (
    <div
      id="torc-chat-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        background: '#0A0F1E',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(26,31,46,0.95)',
          backdropFilter: 'blur(20px)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            borderRadius: '50%',
            padding: '8px',
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Go back"
        >
          <ArrowLeft style={{ width: 20, height: 20, color: 'white' }} />
        </button>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2EFFAF, #007AFF)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#0A0F1E', fontWeight: 'bold', fontSize: 14 }}>{peerInitials}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ color: 'white', fontWeight: 600, fontSize: 14, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peerName}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#2EFFAF' : 'rgba(255,255,255,0.3)' }} />
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{isConnected ? 'Online' : 'Connecting...'}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            borderRadius: '50%',
            padding: '8px',
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Close chat"
        >
          <X style={{ width: 20, height: 20, color: 'rgba(255,255,255,0.6)' }} />
        </button>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {isLoadingHistory && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <Loader2 style={{ width: 24, height: 24, color: 'rgba(255,255,255,0.3)' }} className="animate-spin" />
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', padding: '0 32px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Send style={{ width: 28, height: 28, color: 'rgba(255,255,255,0.2)' }} />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 4 }}>No messages yet</p>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
              Send a message to {peerName} about your service request
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.sender_id === senderId;
          return (
            <div
              key={msg.id}
              style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  borderRadius: 16,
                  padding: '10px 16px',
                  background: isMe
                    ? 'linear-gradient(90deg, #2EFFAF, #007AFF)'
                    : 'rgba(255,255,255,0.1)',
                  color: isMe ? '#0A0F1E' : 'white',
                }}
              >
                {!isMe && (
                  <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, opacity: 0.7, margin: '0 0 2px 0' }}>{msg.sender_name}</p>
                )}
                <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{msg.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <span style={{ fontSize: 10, color: isMe ? 'rgba(10,15,30,0.5)' : 'rgba(255,255,255,0.3)' }}>
                    {formatTime(msg.created_at)}
                  </span>
                  {isMe && msg.status === 'sending' && (
                    <Loader2 style={{ width: 12, height: 12, color: 'rgba(10,15,30,0.4)' }} className="animate-spin" />
                  )}
                  {isMe && msg.status === 'failed' && (
                    <button
                      onClick={() => retryMessage(msg)}
                      style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <WifiOff style={{ width: 12, height: 12, color: '#dc2626' }} />
                      <span style={{ fontSize: 10, color: '#dc2626', textDecoration: 'underline' }}>Retry</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '12px 16px',
          paddingBottom: '24px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(26,31,46,0.95)',
          backdropFilter: 'blur(20px)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 9999,
              padding: '12px 16px',
              color: 'white',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim()}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: inputText.trim()
                ? 'linear-gradient(90deg, #2EFFAF, #007AFF)'
                : 'rgba(255,255,255,0.1)',
              border: 'none',
              cursor: inputText.trim() ? 'pointer' : 'default',
            }}
            aria-label="Send message"
          >
            <Send style={{ width: 20, height: 20, color: inputText.trim() ? '#0A0F1E' : 'rgba(255,255,255,0.3)' }} />
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(chatUI, document.body);
}
