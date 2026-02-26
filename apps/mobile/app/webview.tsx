import { useLocalSearchParams } from 'expo-router';
import AuthenticatedWebView from '../components/AuthenticatedWebView';

export default function WebViewScreen() {
  const { initialPath } = useLocalSearchParams<{ initialPath?: string }>();
  return <AuthenticatedWebView initialPath={initialPath} />;
}
