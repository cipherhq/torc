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
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Once initial auth check completes, never revert to loading screen
  const [initialAuthDone, setInitialAuthDone] = useState(false);
  const initialAuthDoneRef = useRef(false);

  // Track the current user id to detect same-user vs new-user SIGNED_IN events
  const currentUserIdRef = useRef(null);

  // Monotonic counter for stale fetch cancellation
  const profileFetchIdRef = useRef(0);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      currentUserIdRef.current = sessionUser?.id || null;
      if (sessionUser) {
        fetchProfile(sessionUser.id);
      } else {
        setLoading(false);
        setInitialAuthDone(true);
        initialAuthDoneRef.current = true;
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user ?? null;

      // TOKEN_REFRESHED: same session, skip entirely
      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      // SIGNED_IN with same user: skip (duplicate event from token refresh)
      if (event === 'SIGNED_IN' && sessionUser?.id === currentUserIdRef.current) {
        // Silent profile refresh in background (no loading state)
        if (sessionUser) {
          fetchProfile(sessionUser.id, { silent: true });
        }
        return;
      }

      // USER_UPDATED: silent refresh
      if (event === 'USER_UPDATED') {
        setUser(sessionUser);
        if (sessionUser) {
          fetchProfile(sessionUser.id, { silent: true });
        }
        return;
      }

      // SIGNED_OUT
      if (!sessionUser) {
        setUser(null);
        setProfile(null);
        currentUserIdRef.current = null;
        setLoading(false);
        if (!initialAuthDoneRef.current) {
          setInitialAuthDone(true);
          initialAuthDoneRef.current = true;
        }
        return;
      }

      // New user SIGNED_IN
      setUser(sessionUser);
      currentUserIdRef.current = sessionUser.id;
      if (!initialAuthDoneRef.current) {
        setLoading(true);
      }
      fetchProfile(sessionUser.id);

      // Trigger welcome email on first authenticated session (idempotent — server ensures once-only)
      import('../services/email.service').then(({ sendWelcomeEmail }) => {
        sendWelcomeEmail();
      }).catch(() => {});
    });

    return () => subscription.unsubscribe();
  }, []);

  // Listen for native bridge messages (session updates from the native app)
  useEffect(() => {
    if (!isNative) return;

    function handleNativeMessage(event) {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg?.type === 'AUTH_SESSION' && msg.session) {
          // Native sent a refreshed session -- update Supabase client
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

  async function fetchProfile(userId, { silent = false } = {}) {
    const fetchId = ++profileFetchIdRef.current;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // Stale fetch guard
      if (fetchId !== profileFetchIdRef.current) return;

      if (error) throw error;

      // Get user_metadata as fallback for empty/missing profile fields
      const { data: { user: authUser } } = await supabase.auth.getUser();

      // Stale fetch guard
      if (fetchId !== profileFetchIdRef.current) return;

      const meta = authUser?.user_metadata || {};

      const profileBase = data || { id: userId, email: authUser?.email || '' };

      const merged = {
        ...profileBase,
        first_name: profileBase.first_name || meta.first_name || '',
        last_name: profileBase.last_name || meta.last_name || '',
        full_name: profileBase.full_name || meta.full_name || '',
        phone: profileBase.phone || meta.phone || '',
        role: profileBase.role || meta.role || null,
      };

      if (fetchId !== profileFetchIdRef.current) return;
      setProfile(merged);
    } catch (error) {
      if (fetchId !== profileFetchIdRef.current) return;
      console.warn('Error fetching profile:', error);
      // Fallback to auth metadata so route guards don't blank the app.
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (fetchId !== profileFetchIdRef.current) return;
        const meta = authUser?.user_metadata || {};
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
        // Last resort: set minimal profile so app doesn't blank
        if (fetchId !== profileFetchIdRef.current) return;
        setProfile({ id: userId, role: null });
      }
    } finally {
      if (fetchId === profileFetchIdRef.current) {
        setLoading(false);
        if (!initialAuthDoneRef.current) {
          setInitialAuthDone(true);
          initialAuthDoneRef.current = true;
        }
      }
    }
  }

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

  // Only show loading screen before initial auth check completes
  if (!initialAuthDone) {
    return (
      <AuthContext.Provider value={value}>
        <LoadingScreen />
      </AuthContext.Provider>
    );
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

  // Once children have rendered while authenticated, keep rendering them
  // even during background profile refreshes
  const hasRenderedRef = useRef(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
    }
    if (!loading && isAuthenticated && requiredRole && !isAuthorized) {
      if (resolvedRole === 'admin') {
        navigate('/admin');
      } else if (resolvedRole === 'provider') {
        navigate('/provider/home');
      } else {
        navigate('/customer/home');
      }
    }
  }, [isAuthenticated, loading, navigate, requiredRole, isAuthorized, resolvedRole]);

  if (isAuthenticated && isAuthorized) {
    hasRenderedRef.current = true;
  }

  // If we've rendered children before and auth is still valid, keep rendering
  if (hasRenderedRef.current && isAuthenticated) {
    return children;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return isAuthenticated && isAuthorized ? children : null;
}
