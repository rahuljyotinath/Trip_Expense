import type { Metadata } from "next"
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google"
import { PwaRegister } from "@/components/pwa-register"
import { getAppDisplayName, isDevelopmentBrand } from "@/lib/app-display-name"
import "./globals.css"

const appTitle = getAppDisplayName()
const appIcon = isDevelopmentBrand() ? "/icon-dev.svg" : "/icon.svg"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const instrument = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument",
})

export const metadata: Metadata = {
  title: appTitle,
  description:
    "Split trip spends and settle with your group — private trip khata.",
  icons: {
    icon: [{ url: appIcon, type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: appTitle,
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: "#f5f0e8",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} min-h-dvh antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
