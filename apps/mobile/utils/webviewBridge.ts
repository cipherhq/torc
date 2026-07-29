type BridgeMessage = {
  type: string;
  [key: string]: unknown;
};

const messageQueue: BridgeMessage[] = [];
let bridgeReady = false;

function flushQueue() {
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift()!;
    postToWebView(msg);
  }
}

function postToWebView(msg: BridgeMessage) {
  const serialized = JSON.stringify(msg);

  // Capacitor iOS/Android webview
  if (typeof (window as any).webkit?.messageHandlers?.bridge?.postMessage === 'function') {
    (window as any).webkit.messageHandlers.bridge.postMessage(serialized);
    return;
  }

  // React Native style bridge
  if (typeof (window as any).ReactNativeWebView?.postMessage === 'function') {
    (window as any).ReactNativeWebView.postMessage(serialized);
    return;
  }

  // Fallback: window.postMessage (same-origin)
  window.postMessage(serialized, window.location.origin);
}

/**
 * Send a message to the native WebView. Messages are queued until the bridge
 * signals readiness via a `BRIDGE_READY` event, then flushed in order.
 */
export function sendMessage(msg: BridgeMessage) {
  if (bridgeReady) {
    postToWebView(msg);
  } else {
    messageQueue.push(msg);
  }
}

/**
 * Listen for incoming messages from the native side.
 * Automatically handles `BRIDGE_READY` to flush any queued outgoing messages.
 */
export function onMessage(handler: (msg: BridgeMessage) => void): () => void {
  function listener(event: MessageEvent) {
    try {
      const data: BridgeMessage =
        typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

      if (data?.type === 'BRIDGE_READY') {
        bridgeReady = true;
        flushQueue();
        return;
      }

      handler(data);
    } catch {
      // Ignore non-JSON messages
    }
  }

  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
