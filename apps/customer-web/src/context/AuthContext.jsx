import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { registerNativePushForUser, deactivateNativePushToken } from '../utils/nativePush';
import { getAuthCallbackUrl } from '../lib/authRedirectUrl';
import { LoadingScreen } from '../components/LoadingScreen';

const AuthContext = createContext({});

const isNative = typeof window !== 'undefined' && (window.__TORC_NATIVE__ === true || Capacitor.isNativePlatform());

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Once true, never reverts — prevents full-screen loading after bootstrap
  const initialAuthDoneRef = useRef(false);
  const [initialAuthDone, setInitialAuthDone] = useState(false);

  // Track current user ID to detect identity changes vs same-user refreshes
  const currentUserIdRef = useRef(null);

  // Monotonic counter to deduplicate / cancel stale profile fetches
  const profileFetchIdRef = useRef(0);

  const markInitialAuthDone = useCallback(() => {
    if (!initialAuthDoneRef.current) {
      initialAuthDoneRef.current = true;
      setInitialAuthDone(true);
    }
  }, []);

  /**
   * Fetch profile for a given userId. Uses a fetch counter so that if a newer
   * fetch is started before this one completes, the stale result is discarded.
   */
  const fetchProfile = useCallback(async (userId) => {
    const fetchId = ++profileFetchIdRef.current;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      // Stale fetch — a newer one was started, discard this result
      if (fetchId !== profileFetchIdRef.current) return;

      // Get user_metadata as fallback for empty/missing profile fields
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const meta = authUser?.user_metadata || {};

      if (fetchId !== profileFetchIdRef.current) return;

      const profileBase = data || { id: userId, email: authUser?.email || '' };

      const merged = {
        ...profileBase,
        first_name: profileBase.first_name || meta.first_name || '',
        last_name: profileBase.last_name || meta.last_name || '',
        full_name: profileBase.full_name || meta.full_name || '',
        phone: profileBase.phone || meta.phone || '',
        role: profileBase.role || meta.role || null,
      };

      setProfile(merged);
    } catch (error) {
      console.warn('Error fetching profile:', error);

      if (fetchId !== profileFetchIdRef.current) return;

      // Fallback to auth metadata so route guards don't blank the app.
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const meta = authUser?.user_metadata || {};

        if (fetchId !== profileFetchIdRef.current) return;

        setProfile({
          id: userId,
          email: authUser?.email || '',
          first_name: meta.first_name || '',
          last_name: meta.last_name || '',
          full_name: meta.full_name || '',
          phone: meta.phone || '',
          role: meta.role || null,
        });
      } catch {
        // If even getUser fails, set a minimal profile so the app isn't stuck
        if (fetchId !== profileFetchIdRef.current) return;
        setProfile({ id: userId, email: '', role: null });
      }
    }
  }, []);

  useEffect(() => {
    let authSubscription;

    // --- Initial bootstrap: resolve session once ---
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession ?? null);
      setUser(initialSession?.user ?? null);
      currentUserIdRef.current = initialSession?.user?.id ?? null;

      if (initialSession?.user) {
        fetchProfile(initialSession.user.id).then(() => {
          setLoading(false);
          markInitialAuthDone();
        });
      } else {
        setLoading(false);
        markInitialAuthDone();
      }
    }).catch(() => {
      // Storage corrupted or unavailable — unblock the UI
      setLoading(false);
      markInitialAuthDone();
    });

    // --- Auth state change listener ---
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        const newUserId = newSession.user.id;
        const previousUserId = currentUserIdRef.current;
        currentUserIdRef.current = newUserId;

        if (event === 'TOKEN_REFRESHED') {
          // JWT refreshed — supabase-js already updated the session.
          // No profile re-fetch needed, no loading state change.
          return;
        }

        if (event === 'SIGNED_IN') {
          if (previousUserId === newUserId) {
            // Same user re-firing SIGNED_IN (native postMessage sync, tab focus, etc.)
            // No state change needed — profile is already loaded.
            return;
          }
          // Different user signed in — fetch profile silently (no loading=true)
          fetchProfile(newUserId).then(() => {
            // If initial auth wasn't done yet (edge case), mark it now
            setLoading(false);
            markInitialAuthDone();
          });
          return;
        }

        if (event === 'USER_UPDATED') {
          // Profile data may have changed — refresh silently (no loading=true)
          fetchProfile(newUserId);
          return;
        }

        // Any other event with a user — fetch profile silently
        fetchProfile(newUserId).then(() => {
          setLoading(false);
          markInitialAuthDone();
        });
      } else {
        // No user (SIGNED_OUT or session expired)
        currentUserIdRef.current = null;
        setProfile(null);
        setLoading(false);
        markInitialAuthDone();
      }
    });
    authSubscription = subscription;

    return () => authSubscription.unsubscribe();
  }, [fetchProfile, markInitialAuthDone]);

  // Listen for native bridge messages (session updates from the native app)
  useEffect(() => {
    if (!isNative) return;

    const trustedOrigins = [window.location.origin, 'capacitor://localhost', 'http://localhost', 'https://localhost'];

    function handleNativeMessage(event) {
      // Validate message origin
      if (event.origin && !trustedOrigins.includes(event.origin)) return;
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg?.type === 'AUTH_SESSION' && msg.session) {
          // Native sent a refreshed session — update Supabase client
          supabase.auth.setSession({
            access_token: msg.session.access_token,
            refresh_token: msg.session.refresh_token,
          });
        }
      } catch { /* ignore non-JSON messages */ }
    }

    window.addEventListener('message', handleNativeMessage);
    // Signal to native that the web app is ready
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
    }
    return () => window.removeEventListener('message', handleNativeMessage);
  }, []);

  useEffect(() => {
    if (!user) return;
    // Skip browser notification prompts when inside native wrapper
    if (isNative) return;
    if (typeof Notification === 'undefined') return;
    const key = 'torc_customer_notification_prompted_v1';
    if (localStorage.getItem(key) === '1') return;
    localStorage.setItem(key, '1');
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!isNative || !user?.id) return;
    // Delay push registration so iOS has time to present the permission dialog
    const timer = setTimeout(() => {
      registerNativePushForUser({ userId: user.id, role: 'customer' }).catch((error) => {
        console.warn('Native push setup failed:', error);
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [user?.id]);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Enforce role: only customers (and admins) may use this app
    if (data?.user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (prof?.role === 'provider') {
        await supabase.auth.signOut();
        throw new Error('This account is registered as a provider. Please use the TORC Provider app to log in.');
      }
    }

    return data;
  };

  const signUp = async (email, password, userData = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthCallbackUrl(),
        data: userData,
      },
    });
    if (error) throw error;
    return data;
  };

  const resetPasswordForEmail = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthCallbackUrl(),
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    if (user?.id) {
      deactivateNativePushToken(user.id).catch(() => {});
    }
    // When inside native wrapper, tell the native app to handle sign-out
    if (isNative && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SIGN_OUT' }));
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const updateProfile = async (updates) => {
    if (!user) throw new Error('No user logged in');

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    setProfile(data);
    return data;
  };

  const value = {
    user,
    session,
    profile,
    loading,
    isAuthenticated: !!user,
    isCustomer: profile?.role === 'customer',
    signIn,
    signUp,
    signOut,
    resetPasswordForEmail,
    updateProfile,
    refreshProfile: () => user && fetchProfile(user.id),
  };

  // Only show full-screen loading during initial bootstrap
  if (!initialAuthDone) {
    return <LoadingScreen />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// Protected Route Component
export function ProtectedRoute({ children, requiredRole = null }) {
  const { isAuthenticated, loading, profile, user } = useAuth();
  const navigate = useNavigate();
  const resolvedRole = profile?.role || user?.user_metadata?.role || null;
  const isAuthorized = !requiredRole || resolvedRole === requiredRole;

  // Track whether we've rendered children at least once while authenticated.
  // Once true, we never show LoadingScreen again — only redirect on actual sign-out.
  const hasRenderedRef = useRef(false);
  if (isAuthenticated && isAuthorized) {
    hasRenderedRef.current = true;
  }

  useEffect(() => {
    // Only redirect after loading is complete
    if (loading) return;

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (requiredRole && !isAuthorized) {
      if (resolvedRole === 'admin') {
        navigate('/admin');
      } else if (resolvedRole === 'provider') {
        navigate('/provider/home');
      } else {
        navigate('/customer/home');
      }
    }
  }, [isAuthenticated, loading, navigate, requiredRole, isAuthorized, resolvedRole]);

  // After we've rendered children once, keep rendering them even during
  // background profile refreshes — never unmount the active route tree.
  if (hasRenderedRef.current && isAuthenticated) {
    return children;
  }

  // Initial load or not yet authenticated
  if (loading || !isAuthenticated) {
    // If truly loading (initial bootstrap), show loading screen.
    // If not authenticated and not loading, the useEffect will redirect — render nothing briefly.
    return loading ? <LoadingScreen /> : null;
  }

  // Authenticated but wrong role — useEffect will redirect
  if (!isAuthorized) {
    return null;
  }

  return children;
}
