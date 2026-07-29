import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let authSubscription;

    // Check active session, then attach the auth listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(() => setIsHydrated(true));
      } else {
        setLoading(false);
        setIsHydrated(true);
      }
    }).catch(() => {
      // Storage corrupted or unavailable — unblock the UI
      setLoading(false);
      setIsHydrated(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session ?? null);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Only show loading screen and re-fetch profile on actual sign-in,
        // not on TOKEN_REFRESHED which just updates the JWT. Re-fetching
        // profile on token refresh sets loading=true, which unmounts the
        // current page via ProtectedRoute and loses component state.
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          setLoading(true);
          fetchProfile(session.user.id);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    authSubscription = subscription;

    return () => authSubscription.unsubscribe();
  }, []);

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

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      // Get user_metadata as fallback for empty/missing profile fields
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const meta = authUser?.user_metadata || {};

      const profileBase = data || { id: userId, email: authUser?.email || '' };

      const merged = {
        ...profileBase,
        first_name: profileBase.first_name || meta.first_name || '',
        last_name: profileBase.last_name || meta.last_name || '',
        full_name: profileBase.full_name || meta.full_name || '',
        phone: profileBase.phone || meta.phone || '',
        role: profileBase.role || meta.role || 'customer',
      };

      setProfile(merged);
    } catch (error) {
      console.warn('Error fetching profile:', error);
      // Fallback to auth metadata so route guards don't blank the app.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const meta = authUser?.user_metadata || {};
      setProfile({
        id: userId,
        email: authUser?.email || '',
        first_name: meta.first_name || '',
        last_name: meta.last_name || '',
        full_name: meta.full_name || '',
        phone: meta.phone || '',
        role: meta.role || 'customer',
      });
    } finally {
      setLoading(false);
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

  if (!isHydrated) {
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

  if (loading) {
    return <LoadingScreen />;
  }

  return isAuthenticated && isAuthorized ? children : null;
}
