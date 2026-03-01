import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, X, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { setCallActive, stopRequestRingtone } from '../utils/audio';

type CallState = 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';

interface CallModalProps {
  jobId: string;
  peerName: string;
  peerInitials: string;
  isOpen: boolean;
  onClose: () => void;
  /** If true, this side is the caller (sends offer). Otherwise, callee (answers). */
  isOutgoing: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function CallModal({ jobId, peerName, peerInitials, isOpen, onClose, isOutgoing }: CallModalProps) {
  const { user } = useAuth();
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [duration, setDuration] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionChecking, setPermissionChecking] = useState(false);
  const [startNonce, setStartNonce] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedAtRef = useRef<number>(0);

  const channelName = `call-signal-${jobId}`;
  const myId = user?.id || 'unknown';
  const isNativeWebView = typeof window !== 'undefined' && Boolean((window as any).ReactNativeWebView?.postMessage);

  const postNativeBridgeMessage = useCallback((type: 'REQUEST_MIC_PERMISSION' | 'OPEN_APP_SETTINGS') => {
    const bridge = (window as any).ReactNativeWebView;
    if (!bridge?.postMessage) return false;
    try {
      bridge.postMessage(JSON.stringify({ type }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const requestMicrophoneStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionError('Microphone is not supported on this device/browser.');
      return null;
    }

    setPermissionChecking(true);
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      return stream;
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        setPermissionError('Microphone permission is blocked. Tap Allow Audio again, or open App Settings to enable microphone.');
      } else if (e?.name === 'NotFoundError') {
        setPermissionError('No microphone was found on this device.');
      } else {
        setPermissionError('Could not access microphone. Please check device permissions and try again.');
      }
      return null;
    } finally {
      setPermissionChecking(false);
    }
  }, []);

  const cleanup = useCallback(() => {
    setCallActive(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const endCall = useCallback(() => {
    // Broadcast hang-up to peer
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast', event: 'call_signal',
        payload: { type: 'hangup', from: myId },
      }).catch(() => {});
    }
    cleanup();
    setCallState('ended');
    onClose();
  }, [cleanup, myId, onClose]);

  // Pre-check mic permission when modal opens; only start WebRTC after mic is acquired
  const [micReady, setMicReady] = useState(false);

  useEffect(() => {
    if (!isOpen) { setMicReady(false); return; }
    // Stop any playing ringtone/notifications when call modal opens
    stopRequestRingtone();
    setCallActive(true);
    let cancelled = false;
    (async () => {
      const stream = await requestMicrophoneStream();
      if (cancelled) { stream?.getTracks().forEach(t => t.stop()); return; }
      if (stream) { localStreamRef.current = stream; setMicReady(true); }
    })();
    return () => { cancelled = true; };
  }, [isOpen, startNonce, requestMicrophoneStream]);

  // Initialize WebRTC and signaling (only after mic is ready)
  useEffect(() => {
    if (!isOpen || !jobId || !micReady) return;

    let cancelled = false;

    async function startCall() {
      try {
        const stream = localStreamRef.current;
        if (!stream || cancelled) return;

        // Create peer connection
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        // Add local tracks
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Handle remote audio
        pc.ontrack = (ev) => {
          if (remoteAudioRef.current && ev.streams[0]) {
            remoteAudioRef.current.srcObject = ev.streams[0];
            remoteAudioRef.current.play().catch(() => {});
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setCallState('connected');
            connectedAtRef.current = Date.now();
            timerRef.current = setInterval(() => {
              setDuration(Math.floor((Date.now() - connectedAtRef.current) / 1000));
            }, 1000);
          }
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            endCall();
          }
        };

        // Subscribe to signaling channel
        const channel = supabase.channel(channelName, {
          config: { broadcast: { self: false } },
        });

        channel.on('broadcast', { event: 'call_signal' }, async (payload) => {
          const signal = payload.payload;
          if (!signal || signal.from === myId) return;

          if (signal.type === 'offer' && !isOutgoing) {
            // Callee receives offer
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({
              type: 'broadcast', event: 'call_signal',
              payload: { type: 'answer', sdp: answer, from: myId },
            }).catch(() => {});
            setCallState('connecting');
          }

          if (signal.type === 'answer' && isOutgoing) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          }

          if (signal.type === 'ice-candidate' && signal.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (e) {
              console.warn('ICE candidate error:', e);
            }
          }

          if (signal.type === 'hangup') {
            cleanup();
            setCallState('ended');
            onClose();
          }
        });

        await channel.subscribe();
        channelRef.current = channel;

        // ICE candidate trickle
        pc.onicecandidate = (ev) => {
          if (ev.candidate && channelRef.current) {
            channelRef.current.send({
              type: 'broadcast', event: 'call_signal',
              payload: { type: 'ice-candidate', candidate: ev.candidate.toJSON(), from: myId },
            }).catch(() => {});
          }
        };

        if (isOutgoing) {
          // Caller: create and send offer
          setCallState('ringing');
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.send({
            type: 'broadcast', event: 'call_signal',
            payload: { type: 'offer', sdp: offer, from: myId },
          }).catch(() => {});

          // Broadcast call_incoming so the other side opens their CallModal
          channel.send({
            type: 'broadcast', event: 'call_signal',
            payload: { type: 'call_incoming', from: myId },
          }).catch(() => {});
        } else {
          // Callee: wait for offer
          setCallState('ringing');
        }
      } catch (e) {
        console.error('Call setup failed:', e);
        setCallState('ended');
        onClose();
      }
    }

    startCall();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [isOpen, jobId, micReady]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleSpeaker = () => {
    setIsSpeaker(!isSpeaker);
    // On web, speaker toggle is limited — we just toggle volume conceptually
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = isSpeaker ? 0.3 : 1.0;
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const statusText = {
    idle: 'Initializing...',
    ringing: isOutgoing ? 'Ringing...' : 'Incoming call...',
    connecting: 'Connecting...',
    connected: formatDuration(duration),
    ended: 'Call ended',
  }[callState];

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'linear-gradient(180deg, #0A1626 0%, #1A2332 50%, #0A1626 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Animated background rings */}
      {callState === 'ringing' && (
        <>
          <div style={{
            position: 'absolute', width: 200, height: 200, borderRadius: '50%',
            border: '2px solid rgba(0,140,229,0.2)', animation: 'pulse 2s ease-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 280, height: 280, borderRadius: '50%',
            border: '2px solid rgba(0,140,229,0.1)', animation: 'pulse 2s ease-out 0.5s infinite',
          }} />
        </>
      )}

      <button
        onClick={endCall}
        onTouchEnd={(e) => { e.preventDefault(); endCall(); }}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 12px) + 12px)',
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.14)',
          color: '#FFFFFF',
          cursor: 'pointer',
          touchAction: 'manipulation',
          zIndex: 10,
        }}
        aria-label="End call"
      >
        <X style={{ width: 20, height: 20 }} />
      </button>

      {/* Peer avatar */}
      <div style={{
        width: 120, height: 120, borderRadius: '50%',
        background: 'linear-gradient(135deg, #008CE5, #0070B8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        boxShadow: callState === 'connected' ? '0 0 40px rgba(0,140,229,0.4)' : 'none',
      }}>
        <span style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 40 }}>{peerInitials}</span>
      </div>

      {/* Peer name */}
      <h2 style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 'bold', marginBottom: 8 }}>{peerName}</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, marginBottom: permissionError ? 16 : 48 }}>
        {permissionChecking ? 'Requesting microphone permission...' : statusText}
      </p>

      {permissionError && (
        <div style={{
          width: 'min(90vw, 420px)',
          marginBottom: 28,
          background: '#FFFFFF',
          border: '1.5px solid rgba(239,68,68,0.25)',
          borderRadius: 16,
          padding: '14px 14px 12px',
          boxShadow: '0 10px 24px rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <AlertCircle style={{ width: 18, height: 18, color: '#EF4444', flexShrink: 0 }} />
            <p style={{ color: '#14263D', fontSize: 14, fontWeight: 700, margin: 0 }}>Enable Microphone</p>
          </div>
          <p style={{ color: '#4B5563', fontSize: 13, margin: '0 0 10px 0' }}>{permissionError}</p>
          <button
            onClick={async () => {
              if (isNativeWebView) {
                postNativeBridgeMessage('REQUEST_MIC_PERMISSION');
                await new Promise((resolve) => setTimeout(resolve, 350));
              }
              const stream = await requestMicrophoneStream();
              if (stream) {
                setPermissionError(null);
                setStartNonce((n) => n + 1);
              }
            }}
            style={{
              border: 'none',
              borderRadius: 12,
              padding: '10px 14px',
              width: '100%',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #008CE5, #0070B8)',
              color: '#FFFFFF',
              touchAction: 'manipulation',
              boxShadow: '0 6px 16px rgba(0,140,229,0.35)',
            }}
          >
            Allow Audio
          </button>
          {isNativeWebView && (
            <button
              onClick={() => postNativeBridgeMessage('OPEN_APP_SETTINGS')}
              style={{
                border: '1px solid #D1D5DB',
                borderRadius: 12,
                padding: '9px 14px',
                width: '100%',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                background: '#FFFFFF',
                color: '#14263D',
                marginTop: 8,
                touchAction: 'manipulation',
              }}
            >
              Open App Settings
            </button>
          )}
        </div>
      )}

      {/* Call controls */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        {/* Mute */}
        <button onClick={toggleMute} style={{
          width: 60, height: 60, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
          background: isMuted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
          touchAction: 'manipulation',
        }}>
          {isMuted ? (
            <MicOff style={{ width: 24, height: 24, color: '#EF4444' }} />
          ) : (
            <Mic style={{ width: 24, height: 24, color: '#FFFFFF' }} />
          )}
        </button>

        {/* End call */}
        <button
          onClick={endCall}
          onTouchEnd={(e) => { e.preventDefault(); endCall(); }}
          style={{
          width: 72, height: 72, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
          background: '#EF4444', boxShadow: '0 8px 24px rgba(239,68,68,0.4)',
          touchAction: 'manipulation',
        }}>
          <PhoneOff style={{ width: 28, height: 28, color: '#FFFFFF' }} />
        </button>

        {/* Speaker */}
        <button onClick={toggleSpeaker} style={{
          width: 60, height: 60, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
          background: !isSpeaker ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
          touchAction: 'manipulation',
        }}>
          {isSpeaker ? (
            <Volume2 style={{ width: 24, height: 24, color: '#FFFFFF' }} />
          ) : (
            <VolumeX style={{ width: 24, height: 24, color: '#EF4444' }} />
          )}
        </button>
      </div>

      {/* Answer button for incoming calls */}
      {!isOutgoing && callState === 'ringing' && (
        <button onClick={() => {
          // Callee accepts — the offer handling in the signaling listener will create the answer
          // We just need to indicate we're ready
          setCallState('connecting');
        }} style={{
          marginTop: 32, width: 72, height: 72, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', cursor: 'pointer',
          background: '#22C55E', boxShadow: '0 8px 24px rgba(34,197,94,0.4)',
          touchAction: 'manipulation',
        }}>
          <Phone style={{ width: 28, height: 28, color: '#FFFFFF' }} />
        </button>
      )}

      {/* CSS animation for pulse rings */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>,
    document.body
  );
}
