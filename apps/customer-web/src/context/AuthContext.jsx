import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { registerNativePushForUser, deactivateNativePushToken } from '../utils/nativePush';
import { getAuthCallbackUrl } from '../lib/authRedirectUrl';

const AuthContext = createContext({});

const isNative = typeof window !== 'undefined' && (window.__TORC_NATIVE__ === true || Capacitor.isNativePlatform());

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
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
    registerNativePushForUser({ userId: user.id, role: 'customer' }).catch((error) => {
      console.warn('Native push setup failed:', error);
    });
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
    return (
      <div className="min-h-screen bg-[#14263D] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#008CE5] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated && isAuthorized ? children : null;
}
