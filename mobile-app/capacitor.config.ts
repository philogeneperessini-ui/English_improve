import type { CapacitorConfig } from "@capacitor/cli";

const appUrl = process.env.CAPACITOR_SERVER_URL || "http://localhost:3000";

const config: CapacitorConfig = {
  appId: "com.speakmate.english",
  appName: "SpeakMate",
  webDir: "public",
  server: {
    url: appUrl,
    cleartext: appUrl.startsWith("http://"),
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
