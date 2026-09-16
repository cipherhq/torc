import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router';
import { Power, Settings, DollarSign, MapPin, Clock, Navigation, Bell, MessageCircle, X, Star, Check, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { supabase } from '../../lib/supabase';
import { loadPlatformSettings } from '../../lib/platformSettings';
import { initAudio, playRequestRingtone, stopRequestRingtone, requestNotificationPermission, showSystemNotification } from '../../utils/audio';
import { Haptics } from '@capacitor/haptics';

// ── Haversine distance in miles ───────────────────────────────────
function calcDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Service name mapping ──────────────────────────────────────────
const SERVICE_NAMES: Record<string, string> = {
  towing: 'Towing', battery: 'Jump Start', lockout: 'Lockout',
  fuel: 'Fuel Delivery', tire: 'Tire Change', winch: 'Winch Out',
  'minor-repair': 'Minor Repair', diagnostic: 'Diagnostic',
  emergency: 'Emergency Help', motorcycle: 'Motorcycle',
  ev: 'EV Charge', consultation: 'Consultation',
};

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#14263D' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#14263D' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B7280' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A3040' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#14263D' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#333B4D' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E1621' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const lightMapStyle = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#c9e7f7' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D3E0F2' }] },
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#EAF3FF' }] },
];

const mapContainerStyle = { width: '100%', height: '100%' };
const INCOMING_REQUEST_TIMEOUT_SECONDS = 90;

export function ProviderHome() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { user, profile, isVerified, providerProfile, refreshProviderProfile, refreshProfile } = useAuth() as any;
  const { isDark } = useTheme();
  const { isLoaded } = useGoogleMaps();
  const [isOnline, setIsOnline] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [providerRating, setProviderRating] = useState(0);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [incomingJob, setIncomingJob] = useState<any>(null);
  const [incomingCountdown, setIncomingCountdown] = useState(0);
  const [tipToast, setTipToast] = useState<{ amount: number; service: string } | null>(null);
  const [providerServices, setProviderServices] = useState<string[]>([]);
  const providerServicesRef = useRef<string[]>([]);
  const [activeJob, setActiveJob] = useState<{ id: string; status: string; service_name?: string; customer_name?: string } | null>(null);
  const [expiredDocCount, setExpiredDocCount] = useState(0);
  const [expiringSoonDocs, setExpiringSoonDocs] = useState<{ type: string; daysLeft: number }[]>([]);
  const [revocationReason, setRevocationReason] = useState<string | null>(null);
  const [graceInfo, setGraceInfo] = useState<{ daysLeft: number; expired: boolean; missingDocs: boolean } | null>(null);

  // Track dismissed jobs — backed by DB table provider_job_dismissals
  const dismissedJobIds = useRef<Set<string>>(new Set());
  const announcedJobIds = useRef<Set<string>>(new Set());
  const dismissalsLoaded = useRef(false);
  const navigatingToJob = useRef(false);
  const incomingJobRef = useRef<any>(null);
  const incomingQueueRef = useRef<any[]>([]);
  const incomingTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const incomingCountdownRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  const clearIncomingTimers = useCallback(() => {
    if (incomingTimeoutRef.current) {
      window.clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }
    if (incomingCountdownRef.current) {
      window.clearInterval(incomingCountdownRef.current);
      incomingCountdownRef.current = null;
    }
  }, []);

  const openIncomingRequest = useCallback((job: any) => {
    if (!job?.id) return;
    initAudio();
    setIncomingJob(job);
    setIncomingCountdown(INCOMING_REQUEST_TIMEOUT_SECONDS);
    playRequestRingtone();
    // WebView can resume audio context a moment late; retry once.
    setTimeout(() => playRequestRingtone(), 220);
    Haptics.vibrate({ duration: 500 }).catch(() => {});
    navigator.vibrate?.([300, 100, 300, 100, 300, 100, 300]);
  }, []);

  const closeIncomingRequest = useCallback(() => {
    setIncomingJob(null);
    setIncomingCountdown(0);
    stopRequestRingtone();
    navigator.vibrate?.(0);
    clearIncomingTimers();
  }, [clearIncomingTimers]);

  const dismissJob = useCallback(async (jobId: string) => {
    dismissedJobIds.current.add(jobId);
    announcedJobIds.current.add(jobId);
    incomingQueueRef.current = incomingQueueRef.current.filter((j: any) => j.id !== jobId);
    setPendingRequests((prev: any[]) => prev.filter((j: any) => j.id !== jobId));
    if (user) {
      await supabase.from('provider_job_dismissals').upsert(
        { provider_id: user.id, job_id: jobId },
        { onConflict: 'provider_id,job_id' }
      );
    }
  }, [user]);

  const announceIncomingJob = useCallback((job: any) => {
    if (!job?.id) return;
    if (announcedJobIds.current.has(job.id)) return;
    announcedJobIds.current.add(job.id);
    showSystemNotification(
      'New TORC Service Request',
      job.pickup_address || 'A customer nearby needs help!',
      `job-${job.id}`,
    );

    // Always show incoming request as its own full page, not layered under Home.
    if (navigatingToJob.current) return;
    navigatingToJob.current = true;
    stopRequestRingtone();
    closeIncomingRequest();
    navigate(`/request/${job.id}`, { state: { broadcastJob: job } });
    // Fallback: if navigation does not happen, release the guard.
    window.setTimeout(() => {
      if (window.location.pathname === '/home') {
        navigatingToJob.current = false;
      }
    }, 1000);
  }, [closeIncomingRequest, navigate]);

  useEffect(() => {
    incomingJobRef.current = incomingJob;
  }, [incomingJob]);

  // Reset navigation guard whenever we're back on Home.
  // Without this, subsequent incoming jobs can stay in the list
  // and never auto-open the request screen.
  useEffect(() => {
    if (routerLocation.pathname === '/home') {
      navigatingToJob.current = false;
    }
  }, [routerLocation.pathname]);

  useEffect(() => {
    if (!isOnline || incomingJob || incomingQueueRef.current.length === 0) return;
    const nextJob = incomingQueueRef.current.shift();
    if (nextJob) openIncomingRequest(nextJob);
  }, [incomingJob, isOnline, openIncomingRequest]);

  // Defensive fallback: if requests are visible but no popup is active, surface a RECENT one.
  // Only announce jobs created in the last 2 minutes — older ones sit quietly in the list.
  useEffect(() => {
    if (!isOnline || incomingJob || pendingRequests.length === 0) return;
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const candidate = pendingRequests.find((j: any) =>
      j?.id && !dismissedJobIds.current.has(j.id) && !announcedJobIds.current.has(j.id) && j.created_at >= twoMinAgo
    );
    if (candidate) announceIncomingJob(candidate);
  }, [isOnline, incomingJob, pendingRequests, announceIncomingJob]);

  useEffect(() => {
    clearIncomingTimers();
    if (!incomingJob?.id) return;

    let remaining = INCOMING_REQUEST_TIMEOUT_SECONDS;
    setIncomingCountdown(remaining);

    incomingCountdownRef.current = window.setInterval(() => {
      remaining -= 1;
      setIncomingCountdown(Math.max(remaining, 0));
    }, 1000);

    incomingTimeoutRef.current = window.setTimeout(() => {
      const timedOutJobId = incomingJob.id;
      closeIncomingRequest();
      dismissJob(timedOutJobId);
    }, INCOMING_REQUEST_TIMEOUT_SECONDS * 1000);

    return () => clearIncomingTimers();
  }, [incomingJob, clearIncomingTimers, closeIncomingRequest, dismissJob]);

  // Load dismissed job IDs from DB on mount — must complete before polling starts
  useEffect(() => {
    if (!user) return;
    supabase
      .from('provider_job_dismissals')
      .select('job_id')
      .eq('provider_id', user.id)
      .then(({ data }) => {
        if (data) {
          const ids = data.map((d: any) => d.job_id);
          dismissedJobIds.current = new Set(ids);
          ids.forEach((id: string) => announcedJobIds.current.add(id));
        }
        dismissalsLoaded.current = true;
      });
  }, [user]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Get provider's current location — uses Capacitor native API (never re-prompts)
  useEffect(() => {
    let watchId: string | null = null;
    let cancelled = false;

    async function start() {
      const { safeWatchPosition, getSafePosition } = await import('../../utils/safeLocation');
      if (cancelled) return;

      // Start watching — returns null if permission not granted (no prompt)
      watchId = await safeWatchPosition((pos) => {
        setCurrentPos({ lat: pos.lat, lng: pos.lng });
        if (mapRef.current) mapRef.current.panTo({ lat: pos.lat, lng: pos.lng });
      });

      // If watch didn't start (no permission), use a one-shot fallback
      if (!watchId) {
        const fallback = await getSafePosition();
        if (!cancelled) setCurrentPos(fallback);
      }
    }
    start();

    return () => {
      cancelled = true;
      if (watchId) {
        import('../../utils/safeLocation').then(({ safeClearWatch }) => safeClearWatch(watchId));
      }
    };
  }, []);

  // Persist provider location to provider_locations table for tiered dispatch
  const locationUpsertRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isOnline || !user || !currentPos) {
      if (locationUpsertRef.current) {
        clearInterval(locationUpsertRef.current);
        locationUpsertRef.current = null;
      }
      return;
    }

    const upsertLocation = () => {
      supabase.from('provider_locations').upsert({
        provider_id: user.id,
        latitude: currentPos.lat,
        longitude: currentPos.lng,
        is_online: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider_id' }).then(() => {});
    };

    // Immediate upsert when going online or position changes
    upsertLocation();

    // Periodic upsert every 10 seconds for accurate dispatch matching
    locationUpsertRef.current = setInterval(upsertLocation, 10000);

    return () => {
      if (locationUpsertRef.current) {
        clearInterval(locationUpsertRef.current);
        locationUpsertRef.current = null;
      }
    };
  }, [isOnline, user, currentPos]);

  // Load stats + restore online state from DB + calculate real rating
  useEffect(() => {
    if (!user) return;
    async function loadStats() {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: jobs } = await supabase
          .from('jobs')
          .select('total_amount, status, created_at, rating')
          .eq('provider_id', user!.id);

        if (jobs) {
          const todayJobs = jobs.filter(j => j.status === 'completed' && new Date(j.created_at) >= today);
          setTodayEarnings(todayJobs.reduce((sum, j) => sum + (j.total_amount || 0), 0));
          setCompletedCount(jobs.filter(j => j.status === 'completed').length);

          // Calculate real average rating from completed jobs that have ratings
          const ratedJobs = jobs.filter(j => j.status === 'completed' && j.rating != null && j.rating > 0);
          if (ratedJobs.length > 0) {
            const avgRating = ratedJobs.reduce((sum, j) => sum + j.rating, 0) / ratedJobs.length;
            setProviderRating(avgRating);
            // Update provider_profiles with calculated rating
            await supabase.from('provider_profiles').upsert({
              id: user!.id,
              rating: Math.round(avgRating * 10) / 10,
              total_jobs: jobs.filter(j => j.status === 'completed').length,
            }).select();
          }
        }

        const { data: pp } = await supabase
          .from('provider_profiles')
          .select('rating, is_online, services')
          .eq('id', user!.id)
          .maybeSingle();

        if (pp) {
          if (!providerRating && pp.rating) setProviderRating(pp.rating);
          // Restore the provider's online state from DB — don't force offline
          setIsOnline(pp.is_online || false);
          // Load provider's selected services for filtering incoming requests
          const svcList = pp.services || [];
          setProviderServices(svcList);
          providerServicesRef.current = svcList;

          // Redirect to onboarding if no services selected
          if (svcList.length === 0) {
            navigate('/onboarding', { replace: true });
            return;
          }
        } else {
          // No provider profile at all — needs full onboarding
          navigate('/onboarding', { replace: true });
          return;
        }
      } catch (e) { console.warn('Failed to load provider stats:', e); }
    }
    loadStats();
  }, [user]);

  // Check for active jobs — show banner so provider can return to ongoing session
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function checkActiveJob() {
      try {
        const { data } = await supabase
          .from('jobs')
          .select('id, status, service_id, services(name), customers:customer_id(first_name)')
          .eq('provider_id', user.id)
          .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
          .limit(1)
          .maybeSingle();

        if (cancelled) return;
        if (data) {
          setActiveJob({
            id: data.id,
            status: data.status,
            service_name: (data as any).services?.name || undefined,
            customer_name: (data as any).customers?.first_name || undefined,
          });
        } else {
          setActiveJob(null);
        }
      } catch {
        if (!cancelled) setActiveJob(null);
      }
    }

    checkActiveJob();
    const interval = setInterval(checkActiveJob, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  // Check for expired and expiring-soon documents
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    supabase
      .from('documents')
      .select('id, type, expires_at')
      .eq('provider_id', user.id)
      .not('expires_at', 'is', null)
      .then(async ({ data }) => {
        if (!data) return;

        // Already expired
        const expired = data.filter(d => d.expires_at < today);
        setExpiredDocCount(expired.length);
        if (expired.length > 0 && isOnline) {
          setIsOnline(false);
          supabase.from('provider_profiles').upsert({ id: user.id, is_online: false }).then(() => {});
        }

        // Expiring within 30 days (not yet expired)
        const expiring = data
          .filter(d => d.expires_at >= today && d.expires_at <= in30Days)
          .map(d => {
            const diff = Math.ceil((new Date(d.expires_at + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
            return { type: d.type, daysLeft: diff };
          })
          .sort((a, b) => a.daysLeft - b.daysLeft);
        setExpiringSoonDocs(expiring);

        // Create notification reminders for expiring docs (once per document)
        if (expiring.length > 0) {
          for (const doc of expiring) {
            const notifTitle = `Document Expiring Soon`;
            const notifMessage = `Your ${doc.type.replace(/_/g, ' ')} expires in ${doc.daysLeft} day${doc.daysLeft !== 1 ? 's' : ''}. Please upload an updated version.`;
            // Check if we already sent a reminder for this doc this week
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const { data: existing } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', user.id)
              .eq('type', 'warning')
              .ilike('message', `%${doc.type.replace(/_/g, ' ')}%expires%`)
              .gte('created_at', weekAgo)
              .limit(1);
            if (!existing || existing.length === 0) {
              await supabase.from('notifications').insert({
                user_id: user.id,
                type: 'warning',
                title: notifTitle,
                message: notifMessage,
                read: false,
              });
            }
          }
        }
      });
  }, [user]);

  // Check document grace period
  useEffect(() => {
    if (!user || !providerProfile?.created_at) return;
    // Already fully verified — no grace period check needed
    if (isVerified) { setGraceInfo(null); return; }

    async function checkGrace() {
      const settings = await loadPlatformSettings();
      const graceDays = settings.document_grace_period_days || 30;
      const createdAt = new Date(providerProfile.created_at);
      const deadline = new Date(createdAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
      const now = new Date();
      const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Check if all required docs are submitted
      const [docsRes, typesRes] = await Promise.all([
        supabase.from('documents').select('type').eq('provider_id', user.id),
        supabase.from('document_types').select('id').eq('is_required', true).eq('is_active', true),
      ]);
      const uploadedTypes = new Set((docsRes.data || []).map((d: any) => d.type));
      const requiredTypes = (typesRes.data || []).map((t: any) => t.id);
      const missingDocs = requiredTypes.some((t: string) => !uploadedTypes.has(t));

      setGraceInfo({ daysLeft, expired: daysLeft <= 0, missingDocs });
    }
    checkGrace();
  }, [user, providerProfile?.created_at, isVerified]);

  // Poll verification status on Home when not yet verified
  useEffect(() => {
    if (!user || isVerified) return;
    // Immediately refresh once, then poll every 10s
    refreshProviderProfile?.();
    refreshProfile?.();
    const interval = setInterval(() => {
      refreshProviderProfile?.();
      refreshProfile?.();
    }, 10_000);
    return () => clearInterval(interval);
  }, [user, isVerified, refreshProviderProfile, refreshProfile]);

  // Force offline if account gets suspended while online
  useEffect(() => {
    if (!user || isVerified) return;
    if (revocationReason && isOnline) {
      setIsOnline(false);
      supabase.from('provider_profiles').upsert({ id: user.id, is_online: false }).then(() => {});
    }
  }, [user, isVerified, revocationReason, isOnline]);

  // Fetch latest revocation reason when not verified
  useEffect(() => {
    if (!user || isVerified) { setRevocationReason(null); return; }
    supabase
      .from('notifications')
      .select('message')
      .eq('user_id', user.id)
      .eq('type', 'alert')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setRevocationReason(data?.message || null);
      });
  }, [user, isVerified]);

  // Capture declined/cancelled/timed-out job IDs passed via navigation state
  useEffect(() => {
    const state = routerLocation.state as any;
    if (state?.declinedJobId) {
      dismissJob(state.declinedJobId);
      navigatingToJob.current = false;
    }
    if (state?.cancelledJobId) {
      dismissJob(state.cancelledJobId);
      navigatingToJob.current = false;
    }
    if (state?.timedOutJobId) {
      // Timer expired — do NOT dismiss. The job stays in the active queue
      // so it can be re-shown to this provider (sorted by proximity).
      announcedJobIds.current.add(state.timedOutJobId);
      navigatingToJob.current = false;
    }
  }, [routerLocation.state, dismissJob]);

  // Dismiss a pending job from the queue (X button)
  const handleDismissJob = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dismissJob(jobId);
  };

  // Listen for new jobs via Broadcast (doesn't require RLS)
  useEffect(() => {
    if (!isOnline || !user) return;
    navigatingToJob.current = false;

    const handleNewJob = async (payload: any) => {
      if (navigatingToJob.current) return;
      const job = payload.payload;
      if (!job?.id || dismissedJobIds.current.has(job.id)) return;

      // Filter by provider's selected services — ignore jobs for services we don't offer
      const myServices = providerServicesRef.current;
      if (myServices.length > 0 && job.service_id && !myServices.includes(job.service_id)) return;

      // Check if provider already has an active job — don't interrupt
      try {
        const { data: activeJobs } = await supabase
          .from('jobs')
          .select('id')
          .eq('provider_id', user.id)
          .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
          .limit(1);

        if (activeJobs && activeJobs.length > 0) {
          loadPending();
          return;
        }
      } catch {}

      // Add to pending list
      setPendingRequests((prev: any[]) => {
        if (prev.some((r: any) => r.id === job.id)) return prev;
        return [job, ...prev];
      });

      // Announce on broadcast path
      announceIncomingJob(job);
    };

    // Per-provider targeted channel for tiered radius dispatch + tip notifications
    // Global broadcast channels removed — all dispatch is now geographically targeted
    const providerChannel = supabase
      .channel(`provider-job-${user.id}`)
      .on('broadcast', { event: 'new_job' }, handleNewJob)
      .on('broadcast', { event: 'tip_received' }, (msg: any) => {
        const { tip_amount, service } = msg.payload || {};
        if (tip_amount > 0) {
          setTipToast({ amount: tip_amount, service: service || 'Service' });
          showSystemNotification('Tip Received!', `You received a $${tip_amount} tip for ${service || 'your service'}`, 'tip');
          setTimeout(() => setTipToast(null), 5000);
        }
      })
      .subscribe();

    return () => {
      stopRequestRingtone();
      supabase.removeChannel(providerChannel);
    };
  }, [isOnline, user, navigate, announceIncomingJob]);

  // Poll for eligible pending jobs via server-authoritative RPC
  // The RPC enforces: distance <= max_job_radius, service match, location freshness,
  // provider active/verified/online/not-busy — no distant jobs are exposed.
  const loadPending = useCallback(async () => {
    // Wait until dismissed IDs are loaded from DB to avoid showing dismissed jobs
    if (!dismissalsLoaded.current) return;

    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const { data } = await supabase.rpc('get_eligible_pending_jobs_for_provider');
    if (data) {
      // Filter out dismissed jobs (server handles service/distance/eligibility)
      let filtered = (data as any[]).filter((j: any) => !dismissedJobIds.current.has(j.id));

      // Only announce/ring for TRULY NEW jobs (created in last 2 minutes)
      // Older pending jobs show quietly in the list without popup/sound
      const unseen = filtered.filter((j: any) =>
        !announcedJobIds.current.has(j.id) && j.created_at >= twoMinAgo
      );
      if (isOnline && unseen.length > 0) {
        announceIncomingJob(unseen[0]);
      }
      // Mark all loaded jobs as "seen" so they never re-announce
      filtered.forEach((j: any) => announcedJobIds.current.add(j.id));
      setPendingRequests(filtered);
    }
  }, [announceIncomingJob, isOnline]);

  useEffect(() => {
    if (!isOnline || !user) {
      setPendingRequests([]);
      closeIncomingRequest();
      return;
    }
    loadPending();
    const pollInterval = setInterval(loadPending, 10000);
    return () => { clearInterval(pollInterval); };
  }, [isOnline, user, loadPending, closeIncomingRequest]);

  const toggleOnline = async () => {
    // Initialize audio context + request notification permission on user gesture
    initAudio();
    requestNotificationPermission();

    const newStatus = !isOnline;

    // Block going online if account is suspended
    if (newStatus && !isVerified && revocationReason) {
      navigate('/verification-pending');
      return;
    }
    // Require at least one service selected before going online
    if (newStatus && providerServicesRef.current.length === 0) {
      navigate('/services');
      return;
    }
    // Block going online if documents are expired
    if (newStatus && expiredDocCount > 0) {
      navigate('/documents');
      return;
    }
    // Block going online if grace period expired and missing docs
    if (newStatus && graceInfo?.expired && graceInfo?.missingDocs) {
      navigate('/documents');
      return;
    }
    setIsOnline(newStatus);
    if (!newStatus) {
      stopRequestRingtone();
      setPendingRequests([]);
      closeIncomingRequest();
      incomingQueueRef.current = [];
    }
    if (user) {
      await supabase.from('provider_profiles').upsert({ id: user.id, is_online: newStatus }).select();
      // Also update provider_locations for tiered dispatch
      if (currentPos) {
        supabase.from('provider_locations').upsert({
          provider_id: user.id,
          latitude: currentPos.lat,
          longitude: currentPos.lng,
          is_online: newStatus,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'provider_id' }).then(() => {});
      }
    }
  };

  const stats = [
    { label: 'Today', value: `$${todayEarnings.toFixed(2)}`, icon: DollarSign, color: '#008CE5', route: '/earnings' },
    { label: 'Jobs', value: `${completedCount}`, icon: Clock, color: '#0070B8', route: '/reporting' },
    { label: 'Rating', value: providerRating > 0 ? providerRating.toFixed(1) : '-', icon: Star, color: '#F59E0B', route: '/provider/ratings-reviews' },
  ];

  // Filter out dismissed jobs from the visible list
  const visibleRequests = pendingRequests.filter(j => !dismissedJobIds.current.has(j.id));

  const defaultCenter = currentPos || { lat: 40.7128, lng: -74.006 };

  // Theme-aware colors
  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const offlineBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)';
  const offlineBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const overlayGradient = isDark
    ? 'linear-gradient(to bottom, rgba(15,20,25,0.7) 0%, rgba(15,20,25,0.1) 35%, rgba(15,20,25,0.1) 50%, rgba(15,20,25,0.85) 75%, rgba(15,20,25,1) 100%)'
    : 'linear-gradient(to bottom, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.0) 35%, rgba(255,255,255,0.0) 50%, rgba(245,247,250,0.9) 75%, rgba(245,247,250,1) 100%)';

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: isDark ? '#0A1626' : '#EEF4FF' }}>
      {/* Full-screen Google Map */}
      <div className="absolute inset-0 z-0">
        {isLoaded && currentPos ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={defaultCenter}
            zoom={15}
            onLoad={onMapLoad}
            options={{
              styles: isDark ? darkMapStyle : lightMapStyle,
              disableDefaultUI: true,
              zoomControl: false,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              gestureHandling: 'greedy',
            }}
          >
            {currentPos && (
              <Marker
                position={currentPos}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: '#008CE5',
                  fillOpacity: 1,
                  strokeColor: isDark ? '#FFFFFF' : '#14263D',
                  strokeWeight: 3,
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="w-full h-full" style={{ backgroundColor: isDark ? '#14263D' : '#DDE8F7' }}>
            <div className="absolute inset-0" style={{ opacity: isDark ? 0.15 : 0.3 }}>
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke={isDark ? 'rgba(0,140,229,0.4)' : 'rgba(0,122,255,0.15)'} strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ background: overlayGradient }} />

      {/* Note: status banners (active job, expired docs, expiring soon, grace period) are rendered
           inside the bottom content panel below so they flow naturally and don't overlap the toggle */}

      {/* Incoming Request Full-screen Overlay */}
      {incomingJob && createPortal(
        <div
          className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(9,12,18,0.72)' }}
        >
          <div
            className="w-full max-w-md rounded-[28px] border p-5 pb-4"
            style={{
              background: isDark
                ? 'linear-gradient(180deg, rgba(0,140,229,0.28) 0%, rgba(16,24,40,0.95) 35%, rgba(16,24,40,0.98) 100%)'
                : 'linear-gradient(180deg, rgba(0,140,229,0.18) 0%, rgba(255,255,255,0.96) 30%, rgba(255,255,255,0.98) 100%)',
              borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,140,229,0.22)',
              maxHeight: 'min(86vh, 760px)',
              overflowY: 'auto',
            }}
          >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(0,140,229,0.18)' }}>
                    <Bell className="w-6 h-6" style={{ color: '#008CE5' }} />
                    <span className="absolute inset-0 rounded-2xl border border-[#008CE5]/50 animate-ping" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#4B5563' }}>
                      Incoming Request
                    </p>
                    <p className="font-bold text-lg" style={{ color: textColor }}>Accept Job?</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#6B7280' }}>Auto-dismiss</p>
                  <p className="text-xl font-extrabold tabular-nums" style={{ color: '#EF4444' }}>
                    {incomingCountdown}s
                  </p>
                </div>
              </div>

              {/* Customer name */}
              {(incomingJob.customer_first_name || incomingJob.customer_name) && (
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(0,140,229,0.18)' : 'rgba(0,140,229,0.1)' }}>
                    <span className="font-bold text-sm" style={{ color: '#008CE5' }}>
                      {(incomingJob.customer_first_name || incomingJob.customer_name || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: textColor }}>
                      {incomingJob.customer_first_name || ''} {incomingJob.customer_last_name || ''}
                    </p>
                    <p className="text-xs" style={{ color: subColor }}>Customer</p>
                  </div>
                </div>
              )}

              <div className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC', border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : '#E5E7EB'}` }}>
                <p className="font-semibold text-base mb-1" style={{ color: textColor }}>
                  {SERVICE_NAMES[incomingJob.service_id] || incomingJob.service_id || 'Service Request'}
                </p>
                <p className="text-sm mb-2" style={{ color: isDark ? 'rgba(255,255,255,0.75)' : '#374151' }}>
                  {incomingJob.pickup_address || 'Nearby location'}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: isDark ? 'rgba(255,255,255,0.52)' : '#6B7280' }}>
                    Arrived {getTimeAgo(incomingJob.created_at)}
                  </span>
                  <span className="font-bold text-lg" style={{ color: '#008CE5' }}>
                    ${(Number(incomingJob.total_amount) || Number(incomingJob.base_price) || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    const jobId = incomingJob.id;
                    closeIncomingRequest();
                    dismissJob(jobId);
                  }}
                  className="h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.1)',
                    color: '#EF4444',
                    border: '1px solid rgba(239,68,68,0.35)',
                    touchAction: 'manipulation',
                  }}
                >
                  <X className="w-4 h-4" />
                  Decline
                </button>
                <button
                  onClick={() => {
                    const selectedJob = incomingJob;
                    closeIncomingRequest();
                    stopRequestRingtone();
                    navigatingToJob.current = true;
                    navigate(`/request/${selectedJob.id}`, { state: { broadcastJob: selectedJob } });
                  }}
                  className="h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 text-white"
                  style={{
                    background: 'linear-gradient(135deg, #008CE5, #0070B8)',
                    boxShadow: '0 10px 20px rgba(0,140,229,0.35)',
                    touchAction: 'manipulation',
                  }}
                >
                  <Check className="w-4 h-4" />
                  Accept
                </button>
              </div>
          </div>
        </div>,
        document.body
      )}

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col min-h-screen pb-24" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        {/* Header */}
        <div className="p-6 flex items-center justify-between" style={{ paddingTop: 'var(--safe-top)' }}>
          <div className="flex items-center gap-3">
            <img
              src={isDark ? '/logo-white.svg' : '/logo.svg'}
              alt="Torc"
              className="h-10 w-auto object-contain"
            />
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(0,140,229,0.12)', color: '#008CE5' }}>
              PROVIDER
            </span>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/profile')}
            className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xl"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)', border: `1px solid ${cardBorder}` }}
          >
            <Settings className="w-5 h-5" style={{ color: textColor }} />
          </motion.button>
        </div>

        {/* Spacer to push content down over map */}
        <div className="flex-1 min-h-[200px]" />

        {/* Bottom content panel */}
        <div className="px-4 space-y-4">
          {/* Active job banner — return to ongoing session */}
          {activeJob && (
            <button
              onClick={() => navigate(`/job/${activeJob.id}`)}
              className="w-full rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #008CE5, #0070B8)',
                boxShadow: '0 8px 24px rgba(0,140,229,0.4)',
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
                <Navigation className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-bold text-sm">Active Job in Progress</p>
                <p className="text-white/70 text-xs">
                  {activeJob.service_name || 'Service'}{activeJob.customer_name ? ` · ${activeJob.customer_name}` : ''} · Tap to return
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white text-lg">→</span>
              </div>
            </button>
          )}

          {/* Expired documents warning banner */}
          {expiredDocCount > 0 && !activeJob && (
            <button
              onClick={() => navigate('/documents')}
              className="w-full rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                boxShadow: '0 8px 24px rgba(239,68,68,0.35)',
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-bold text-sm">Expired Documents</p>
                <p className="text-white/70 text-xs">
                  {expiredDocCount} document{expiredDocCount !== 1 ? 's' : ''} expired. Tap to update and avoid suspension.
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white text-lg">→</span>
              </div>
            </button>
          )}

          {/* Expiring soon documents warning banner */}
          {expiringSoonDocs.length > 0 && expiredDocCount === 0 && !activeJob && (
            <button
              onClick={() => navigate('/documents')}
              className="w-full rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                boxShadow: '0 8px 24px rgba(245,158,11,0.35)',
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-bold text-sm">Documents Expiring Soon</p>
                <p className="text-white/70 text-xs">
                  {expiringSoonDocs.length === 1
                    ? `Your ${expiringSoonDocs[0].type.replace(/_/g, ' ')} expires in ${expiringSoonDocs[0].daysLeft} day${expiringSoonDocs[0].daysLeft !== 1 ? 's' : ''}.`
                    : `${expiringSoonDocs.length} documents expiring soon. Earliest in ${expiringSoonDocs[0].daysLeft} day${expiringSoonDocs[0].daysLeft !== 1 ? 's' : ''}.`}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white text-lg">→</span>
              </div>
            </button>
          )}

          {/* Grace period banner */}
          {graceInfo && graceInfo.missingDocs && !activeJob && expiredDocCount === 0 && (
            <button
              onClick={() => navigate('/documents')}
              className="w-full rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform shadow-lg"
              style={{
                background: graceInfo.expired
                  ? 'linear-gradient(135deg, #EF4444, #DC2626)'
                  : 'linear-gradient(135deg, #F59E0B, #D97706)',
                boxShadow: graceInfo.expired
                  ? '0 8px 24px rgba(239,68,68,0.35)'
                  : '0 8px 24px rgba(245,158,11,0.35)',
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-bold text-sm">
                  {graceInfo.expired ? 'Account Locked — Documents Required' : `${graceInfo.daysLeft} Day${graceInfo.daysLeft !== 1 ? 's' : ''} Left to Submit Documents`}
                </p>
                <p className="text-white/70 text-xs">
                  {graceInfo.expired
                    ? 'Your grace period has ended. Submit all required documents to unlock your account.'
                    : 'Upload all required documents before your grace period expires.'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-white text-lg">→</span>
              </div>
            </button>
          )}

          {/* Account suspended banner — admin revoked verification */}
          {!isVerified && revocationReason && (
            <div
              className="rounded-[28px] p-5 flex items-start gap-4"
              style={{
                backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2',
                border: `1px solid ${isDark ? 'rgba(239,68,68,0.2)' : '#FECACA'}`,
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: '#EF4444' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm mb-1" style={{ color: isDark ? '#EF4444' : '#B91C1C' }}>
                  Account Suspended
                </p>
                <p className="text-xs mb-2 font-medium" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>
                  {revocationReason}
                </p>
                <p className="text-xs mb-3" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
                  Please contact support or check your application status for more details.
                </p>
                <button
                  onClick={() => navigate('/verification-pending')}
                  className="text-xs font-bold px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
                >
                  View Application Status
                </button>
              </div>
            </div>
          )}

          {/* Verification pending banner — not yet approved, no revocation */}
          {!isVerified && !revocationReason && (
            <div
              className="rounded-[28px] p-5 flex items-start gap-4"
              style={{
                backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#FFFBEB',
                border: `1px solid ${isDark ? 'rgba(245,158,11,0.2)' : '#FDE68A'}`,
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: '#F59E0B' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm mb-1" style={{ color: isDark ? '#F59E0B' : '#92400E' }}>
                  Verification Required
                </p>
                <p className="text-xs mb-3" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
                  Verification is still required. You can continue accepting requests while your application status is finalized.
                </p>
                <button
                  onClick={() => navigate('/verification-pending')}
                  className="text-xs font-bold px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
                >
                  Check Application Status
                </button>
              </div>
            </div>
          )}

          {/* Online status toggle */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={toggleOnline}
            className="w-full rounded-[28px] p-5 text-left transition-all backdrop-blur-xl"
            style={{
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              background: isOnline
                ? 'linear-gradient(135deg, #008CE5, #0070B8)'
                : offlineBg,
              border: isOnline ? 'none' : `1px solid ${offlineBorder}`,
              boxShadow: isOnline
                ? '0 8px 32px rgba(0,140,229,0.35)'
                : (isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.06)'),
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: isOnline ? 'rgba(255,255,255,0.2)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') }}>
                  <Power className="w-7 h-7" style={{ color: isOnline ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF') }} />
                </div>
                <div>
                  <h2 className="text-xl font-bold" style={{ color: isOnline ? '#FFFFFF' : textColor }}>
                    {isOnline ? "You're Online" : "You're Offline"}
                  </h2>
                  <p className="text-sm" style={{ color: isOnline ? 'rgba(255,255,255,0.75)' : subColor }}>
                    {isOnline ? 'Ready to accept requests' : 'Tap to go online'}
                  </p>
                </div>
              </div>
              <div className="w-12 h-7 rounded-full relative transition-all"
                style={{ backgroundColor: isOnline ? 'rgba(255,255,255,0.3)' : (isDark ? 'rgba(255,255,255,0.1)' : '#D1D5DB') }}>
                <div className="absolute w-5 h-5 rounded-full top-1 transition-all shadow-lg"
                  style={{
                    backgroundColor: isOnline ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.5)' : '#FFFFFF'),
                    right: isOnline ? '4px' : 'auto',
                    left: isOnline ? 'auto' : '4px',
                  }} />
              </div>
            </div>
          </motion.button>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.button
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => navigate(stat.route)}
                  className="rounded-2xl p-3.5 text-center backdrop-blur-xl"
                  style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.04)' }}
                >
                  <Icon className="w-5 h-5 mx-auto mb-1.5" style={{ color: stat.color }} />
                  <p className="font-bold text-lg leading-tight" style={{ color: textColor }}>{stat.value}</p>
                  <p className="text-[11px]" style={{ color: subColor }}>{stat.label}</p>
                </motion.button>
              );
            })}
          </div>

          {/* Active requests */}
          <div className="rounded-[28px] p-5 backdrop-blur-xl"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-base" style={{ color: textColor }}>Active Requests</h3>
              {visibleRequests.length > 0 && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#008CE5', color: '#FFFFFF' }}>
                  {visibleRequests.length}
                </span>
              )}
            </div>

            {isOnline ? (
              visibleRequests.length > 0 ? (
                <div className="space-y-2.5 max-h-64 overflow-y-auto">
                  {visibleRequests.map((req: any) => {
                    const timeAgo = getTimeAgo(req.created_at);
                    const serviceName = SERVICE_NAMES[req.service_id] || req.service_id || 'Service Request';
                    const amount = Number(req.total_amount) || Number(req.base_price) || 0;
                    const distance = (currentPos && req.pickup_latitude && req.pickup_longitude)
                      ? calcDistanceMiles(currentPos.lat, currentPos.lng, req.pickup_latitude, req.pickup_longitude)
                      : null;
                    return (
                      <motion.div
                        key={req.id}
                        whileTap={{ scale: 0.98 }}
                        className="w-full rounded-2xl p-3.5 flex items-center gap-3"
                        style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}
                      >
                        <button
                          onClick={() => { stopRequestRingtone(); navigate(`/request/${req.id}`); }}
                          className="flex-1 min-w-0 flex items-center gap-3 text-left"
                          style={{ touchAction: 'manipulation' }}
                        >
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}>
                            <MapPin className="w-5 h-5" style={{ color: '#008CE5' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate" style={{ color: textColor }}>
                              {serviceName}
                              {req.customer_first_name ? ` — ${req.customer_first_name} ${req.customer_last_name || ''}`.trimEnd() : ''}
                            </p>
                            <p className="text-xs truncate" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#6B7280' }}>
                              {req.pickup_address || 'Nearby location'}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {amount > 0 && (
                                <span className="text-xs font-bold" style={{ color: '#008CE5' }}>${amount.toFixed(2)}</span>
                              )}
                              {distance !== null && (
                                <span className="text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
                                  {distance < 1 ? `${(distance * 5280).toFixed(0)} ft` : `${distance.toFixed(1)} mi`}
                                </span>
                              )}
                              <span className="text-xs" style={{ color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }}>{timeAgo}</span>
                            </div>
                          </div>
                        </button>

                        <div className="w-[36px] flex items-center justify-center flex-shrink-0">
                          <button
                            onClick={(e: React.MouseEvent) => handleDismissJob(req.id, e)}
                            className="w-7 h-7 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', touchAction: 'manipulation' }}
                            aria-label="Dismiss request"
                          >
                            <X className="w-4 h-4" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: 'rgba(0,140,229,0.15)' }}
                  >
                    <Navigation className="w-8 h-8" style={{ color: '#008CE5' }} />
                  </motion.div>
                  <p className="text-sm mb-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Waiting for requests...</p>
                  <p className="text-xs" style={{ color: subColor }}>We'll notify you when someone needs help</p>
                </div>
              )
            ) : (
              <div className="text-center py-8">
                <p className="text-sm" style={{ color: subColor }}>Go online to start receiving requests</p>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-3 pb-4">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/earnings')}
              className="rounded-2xl p-4 text-left backdrop-blur-xl"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              <DollarSign className="w-7 h-7 mb-1.5" style={{ color: '#008CE5' }} />
              <p className="font-semibold text-sm" style={{ color: textColor }}>Earnings</p>
              <p className="text-xs" style={{ color: subColor }}>View payouts</p>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/provider/messages')}
              className="rounded-2xl p-4 text-left backdrop-blur-xl"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              <MessageCircle className="w-7 h-7 mb-1.5" style={{ color: '#008CE5' }} />
              <p className="font-semibold text-sm" style={{ color: textColor }}>Messages</p>
              <p className="text-xs" style={{ color: subColor }}>Chat with users</p>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/profile')}
              className="rounded-2xl p-4 text-left backdrop-blur-xl"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, boxShadow: isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              <Settings className="w-7 h-7 mb-1.5" style={{ color: '#0070B8' }} />
              <p className="font-semibold text-sm" style={{ color: textColor }}>Settings</p>
              <p className="text-xs" style={{ color: subColor }}>Manage profile</p>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Tip received toast */}
      {tipToast && createPortal(
        <motion.div
          initial={{ opacity: 0, y: -60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -60 }}
          className="fixed top-0 left-0 right-0 z-[2147483000] flex justify-center"
          style={{ paddingTop: 'calc(var(--safe-top, 0px) + 12px)' }}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl px-5 py-4 flex items-center gap-4 backdrop-blur-xl"
            style={{
              background: isDark
                ? 'linear-gradient(135deg, rgba(0,140,229,0.25), rgba(34,197,94,0.18))'
                : 'linear-gradient(135deg, rgba(0,140,229,0.12), rgba(34,197,94,0.1))',
              border: `1px solid ${isDark ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.3)'}`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            }}
          >
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: '#22C55E' }}>Tip Received!</p>
              <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.8)' : '#374151' }}>
                You got a <span className="font-bold text-green-400">${tipToast.amount}</span> tip for {tipToast.service}
              </p>
            </div>
            <button onClick={() => setTipToast(null)} className="flex-shrink-0 p-1">
              <X className="w-4 h-4" style={{ color: subColor }} />
            </button>
          </div>
        </motion.div>,
        document.body,
      )}

    </div>
  );
}
