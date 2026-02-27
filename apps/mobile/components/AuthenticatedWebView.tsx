import React, { useRef, useCallback, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, BackHandler, Platform, Text, Share as NativeShare, PermissionsAndroid, Linking } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { WEBVIEW_URLS, WEBVIEW_LOCAL_CANDIDATES, WEBVIEW_PROD_URLS } from '../config/webview';
import {
  buildSessionInjectionJS,
  buildPostMessageJS,
  parseWebMessage,
} from '../utils/webviewBridge';

interface Props {
  initialPath?: string;
}

export default function AuthenticatedWebView({ initialPath }: Props) {
  const webviewRef = useRef<WebView>(null);
  const cacheBustRef = useRef<string>(String(Date.now()));
  const { session, profile, signOut } = useAuth();
  const router = useRouter();

  const role = profile?.role === 'provider'
    ? 'provider'
    : profile?.role === 'admin'
    ? 'admin'
    : 'customer';
  const baseUrl = WEBVIEW_URLS[role];
  const [resolvedBaseUrl, setResolvedBaseUrl] = React.useState<string>(baseUrl);
  const pathSuffix = initialPath ? initialPath : '';
  const sourceUrl = `${resolvedBaseUrl}${pathSuffix}${resolvedBaseUrl.includes('?') || pathSuffix.includes('?') ? '&' : '?'}cb=${cacheBustRef.current}`;

  useEffect(() => {
    let cancelled = false;

    const localCandidates = WEBVIEW_LOCAL_CANDIDATES[role];
    const prodUrl = WEBVIEW_PROD_URLS[role];

    async function resolveUrl() {
      // Always prefer local dev servers when reachable, even in non-__DEV__
      // builds used for simulator/emulator testing.
      for (const candidate of localCandidates) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 1000);
          const resp = await fetch(candidate, { method: 'HEAD', signal: controller.signal } as RequestInit);
          clearTimeout(timeout);
          if (!cancelled && resp.ok) {
            setResolvedBaseUrl(candidate);
            return;
          }
        } catch {
          // candidate unreachable
        }
      }

      if (__DEV__) {
        // In dev, if probe failed (e.g. HEAD blocked), still try first local candidate.
        if (!cancelled) setResolvedBaseUrl(localCandidates[0]);
        return;
      }

      // Production fallback
      if (!cancelled) setResolvedBaseUrl(prodUrl);
    }

    resolveUrl();
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    // Helps validate which bundle is actually being rendered in simulator logs.
    console.log('[webview] role:', role, 'resolvedBaseUrl:', resolvedBaseUrl);
  }, [role, resolvedBaseUrl]);

  // Inject session before the web app loads
  const injectedJS = session ? buildSessionInjectionJS(session) : '';

  // Handle messages from the web app
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseWebMessage(event.nativeEvent.data);
      if (!message) return;

      switch (message.type) {
        case 'SIGN_OUT':
          signOut().then(() => {
            router.replace('/auth/login');
          });
          break;

        case 'NAVIGATE_NATIVE':
          if (message.screen) {
            router.push(message.screen as any);
          }
          break;

        case 'SHARE': {
          const title = message.payload?.title || 'Share';
          const text = message.payload?.text || '';
          const url = message.payload?.url || '';
          const body = [text, url].filter(Boolean).join('\n');
          NativeShare.share({
            title,
            subject: title,
            message: body,
            url: url || undefined,
          }).catch(() => {});
          break;
        }

        case 'REQUEST_MIC_PERMISSION':
          if (Platform.OS === 'android') {
            PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
              title: 'Microphone Access',
              message: 'Torc needs microphone access for in-app calls.',
              buttonPositive: 'Allow',
              buttonNegative: 'Not now',
            }).catch(() => {});
          }
          break;

        case 'OPEN_APP_SETTINGS':
          Linking.openSettings().catch(() => {});
          break;

        case 'READY':
          // Web app is mounted and ready — sync any pending state
          if (session) {
            webviewRef.current?.injectJavaScript(
              buildPostMessageJS({ type: 'AUTH_SESSION', session })
            );
          }
          break;
      }
    },
    [session, signOut, router]
  );

  // Android hardware back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (webviewRef.current) {
        webviewRef.current.goBack();
        return true; // prevent default (app exit)
      }
      return false;
    });

    return () => handler.remove();
  }, []);

  // Re-inject session into webview when token refreshes
  useEffect(() => {
    if (session && webviewRef.current) {
      webviewRef.current.injectJavaScript(
        buildPostMessageJS({ type: 'AUTH_SESSION', session })
      );
    }
  }, [session]);

  // Forward notification taps to the WebView (lazy import to avoid Expo Go crash)
  useEffect(() => {
    let sub: { remove(): void } | null = null;
    import('expo-notifications')
      .then((Notifications) => {
        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;
          if (data?.screen && webviewRef.current) {
            webviewRef.current.injectJavaScript(
              buildPostMessageJS({ type: 'NAVIGATE', path: `/${data.screen}` })
            );
          }
        });
      })
      .catch(() => {});
    return () => sub?.remove();
  }, []);

  if (!session) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2EFFAF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <WebView
        ref={webviewRef}
        source={{ uri: sourceUrl }}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onMessage={handleMessage}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#2EFFAF" />
          </View>
        )}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
        allowsBackForwardNavigationGestures
        sharedCookiesEnabled
        style={styles.webview}
      />
      {__DEV__ && (
        <View style={styles.devBadge}>
          <Text style={styles.devBadgeText}>{resolvedBaseUrl}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  devBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    maxWidth: '84%',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  devBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F1419',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
