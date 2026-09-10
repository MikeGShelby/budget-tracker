import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor wraps the Vite build as a native iOS app.
 *
 *   npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/ios
 *   npx cap add ios
 *   npm run ios:sync && npm run ios:open
 *
 * The web build in `dist/` is copied verbatim into the app bundle, so the same
 * codebase serves the web app and the App Store binary.
 */
const config: CapacitorConfig = {
  appId: 'com.mikegshelby.ledger',
  appName: 'Ledger',
  webDir: 'dist',
  ios: {
    // The UI paints its own dark canvas edge to edge; the status bar text is
    // set to light in index.html via apple-mobile-web-app-status-bar-style.
    backgroundColor: '#0B0D12',
    contentInset: 'never',
    scrollEnabled: false,
    limitsNavigationsToAppBoundDomains: true,
  },
  server: {
    // Prevents the WKWebView from treating swipe-back as navigation.
    iosScheme: 'ledger',
  },
}

export default config
