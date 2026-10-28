import type { CapacitorConfig } from "@capacitor/cli"

const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://instant-breeze-lojqz55-rahuljyotinath-8458s-projects.vercel.app"

const config: CapacitorConfig = {
  appId: "com.tripzy.app",
  appName: "Tripzy",
  webDir: "www",
  server: {
    url: serverUrl.replace(/\/$/, ""),
    cleartext: false,
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#f5f0e8",
    },
    StatusBar: {
      style: "DEFAULT",
      backgroundColor: "#f5f0e8",
    },
  },
}

export default config
