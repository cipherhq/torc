import Constants from 'expo-constants';

const DEV_HOST = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
const HOST_CANDIDATES = Array.from(new Set([DEV_HOST, 'localhost', '127.0.0.1', '10.0.2.2']));

export const WEBVIEW_LOCAL_URLS = {
  customer: `http://${DEV_HOST}:7010`,
  provider: `http://${DEV_HOST}:7001`,
  admin: `http://${DEV_HOST}:8082/admin/`,
} as const;

function candidateUrls(ports: number[], pathSuffix = '') {
  return HOST_CANDIDATES.flatMap((host) => ports.map((port) => `http://${host}:${port}${pathSuffix}`));
}

export const WEBVIEW_LOCAL_CANDIDATES = {
  // Use only the current monorepo dev ports to avoid loading stale apps.
  customer: candidateUrls([7010, 7000]),
  provider: candidateUrls([7001]),
  admin: candidateUrls([8082], '/admin/'),
} as const;

export const WEBVIEW_PROD_URLS = {
  customer: 'https://customer-web-rho-three.vercel.app',
  provider: 'https://provider-web-zeta.vercel.app',
  admin: 'https://admin-web-black-eight.vercel.app',
} as const;

export const WEBVIEW_URLS = {
  customer: __DEV__ ? WEBVIEW_LOCAL_URLS.customer : WEBVIEW_PROD_URLS.customer,
  provider: __DEV__ ? WEBVIEW_LOCAL_URLS.provider : WEBVIEW_PROD_URLS.provider,
  admin: __DEV__ ? WEBVIEW_LOCAL_URLS.admin : WEBVIEW_PROD_URLS.admin,
} as const;
