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
  const [providerProfile, setProviderProfile] = useState(null);
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

  const fetchProviderProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('provider_profiles')
        .select('id, is_verified, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProviderProfile(data || null);
      return data || null;
    } catch (error) {
      console.warn('Error fetching provider profile:', error);
      return null;
    }
  }, []);

  const fetchProfile = useCallback(async (userId) => {
    const fetchId = ++profileFetchIdRef.current;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (fetchId !== profileFetchIdRef.current) return;

      const { data: { user: authUser } } = await supabase.auth.getUser();
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

      setProfile(merged);

      if (merged.role === 'provider') {
        await fetchProviderProfile(userId);
      }
    } catch (error) {
      if (fetchId !== profileFetchIdRef.current) return;

      console.warn('Error fetching profile:', error);
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
        if (fetchId !== profileFetchIdRef.current) return;
        setProfile({ id: userId, email: '', role: null });
      }
    }
  }, [fetchProviderProfile]);

  useEffect(() => {
    let authSubscription;

    // --- Initial bootstrap: resolve session once ---
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      currentUserIdRef.current = session?.user?.id ?? null;

      if (session?.user) {
        fetchProfile(session.user.id).then(() => {
          setLoading(false);
          markInitialAuthDone();
        });
      } else {
        setLoading(false);
        markInitialAuthDone();
      }
    }).catch(() => {
      setLoading(false);
      markInitialAuthDone();
    });

    // --- Auth state change listener — never sets loading=true after bootstrap ---
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (session?.user) {
        const newUserId = session.user.id;
        const previousUserId = currentUserIdRef.current;
        currentUserIdRef.current = newUserId;

        if (event === 'TOKEN_REFRESHED') {
          return;
        }

        if (event === 'SIGNED_IN') {
          if (previousUserId === newUserId) {
            return;
          }
          fetchProfile(newUserId).then(() => {
            setLoading(false);
            markInitialAuthDone();
          });
          return;
        }

        if (event === 'USER_UPDATED') {
          fetchProfile(newUserId);
          return;
        }

        fetchProfile(newUserId).then(() => {
          setLoading(false);
          markInitialAuthDone();
        });
      } else {
        currentUserIdRef.current = null;
        setProfile(null);
        setProviderProfile(null);
        setLoading(false);
        markInitialAuthDone();
      }
    });
    authSubscription = subscription;

    return () => authSubscription.unsubscribe();
  }, [fetchProfile, markInitialAuthDone]);

  // Native bridge messages
  useEffect(() => {
    if (!isNative) return;

    const trustedOrigins = [window.location.origin, 'capacitor://localhost', 'http://localhost', 'https://localhost'];

    function handleNativeMessage(event) {
      if (event.origin && !trustedOrigins.includes(event.origin)) return;
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg?.type === 'AUTH_SESSION' && msg.session) {
          supabase.auth.setSession({
            access_token: msg.session.access_token,
            refresh_token: msg.session.refresh_token,
          });
        }
      } catch { /* ignore non-JSON messages */ }
    }

    window.addEventListener('message', handleNativeMessage);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
    }
    return () => window.removeEventListener('message', handleNativeMessage);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (isNative) return;
    if (typeof Notification === 'undefined') return;
    const key = 'torc_provider_notification_prompted_v1';
    if (localStorage.getItem(key) === '1') return;
    localStorage.setItem(key, '1');
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!isNative || !user?.id) return;
    const timer = setTimeout(() => {
      registerNativePushForUser({ userId: user.id, role: 'provider' }).catch((error) => {
        console.warn('Native push setup failed:', error);
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [user?.id]);

  // Real-time: auto-refresh provider profile when admin changes verification
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('auth-provider-profile')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'provider_profiles',
        filter: `id=eq.${user.id}`,
      }, () => {
        fetchProviderProfile(user.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchProviderProfile]);

  // Re-fetch profile data when app comes back to foreground
  useEffect(() => {
    if (!user?.id) return;
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        fetchProviderProfile(user.id);
        fetchProfile(user.id);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user?.id, fetchProviderProfile, fetchProfile]);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data?.user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (prof?.role && prof.role !== 'provider') {
        await supabase.auth.signOut();
        throw new Error('This account is registered as a customer. Please use the TORC Customer app to log in.');
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
    if (isNative && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SIGN_OUT' }));
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
    setProviderProfile(null);
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

  const refreshProfile = useCallback(() => user && fetchProfile(user.id), [user, fetchProfile]);
  const refreshProviderProfile = useCallback(
    () => (user ? fetchProviderProfile(user.id) : Promise.resolve(null)),
    [user, fetchProviderProfile],
  );

  const value = {
    user,
    profile,
    providerProfile,
    loading,
    isAuthenticated: !!user,
    isCustomer: profile?.role === 'customer',
    isVerified: providerProfile?.is_verified === true || profile?.is_verified === true,
    signIn,
    signUp,
    signOut,
    resetPasswordForEmail,
    updateProfile,
    refreshProfile,
    refreshProviderProfile,
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
export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const hasRenderedRef = useRef(false);

  if (isAuthenticated) {
    hasRenderedRef.current = true;
  }

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, loading, navigate]);

  if (hasRenderedRef.current && isAuthenticated) {
    return children;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return isAuthenticated ? children : null;
}

export function ProviderProtectedRoute({ children }) {
  const { isAuthenticated, loading, profile } = useAuth();
  const navigate = useNavigate();
  const isAuthorized = profile?.role === 'provider';
  const hasRenderedRef = useRef(false);

  if (isAuthenticated && isAuthorized) {
    hasRenderedRef.current = true;
  }

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!isAuthorized) {
      navigate('/login');
    }
  }, [isAuthenticated, loading, isAuthorized, navigate]);

  if (hasRenderedRef.current && isAuthenticated) {
    return children;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return isAuthenticated && isAuthorized ? children : null;
}
