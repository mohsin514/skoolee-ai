import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.skoolee.app",
  appName: "Skoolee AI",
  // The web app is a server-rendered Next.js site with cookie auth, so the
  // native shells load the deployed app instead of bundling a static copy.
  // Feature updates reach every platform the moment the web deploys.
  server: {
    url: "https://app.skooleeai.com",
    cleartext: false,
  },
  webDir: "public",
  backgroundColor: "#fff7fe",
  android: {
    allowMixedContent: false,
  },
};

export default config;
