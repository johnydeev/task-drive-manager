import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { RegisterPWA } from "@/components/providers/RegisterPWA";
import { UpdateBanner } from "@/components/providers/UpdateBanner";
import { getActiveSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/app-name";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Administración de consorcios — registro y seguimiento de tareas",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_SHORT_NAME,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  // Alineado al theme_color del manifest (azul del logo).
  themeColor: "#7c92aa",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Inyectamos la sesión activa al cliente. En DEMO_MODE, viene poblada con la fake.
  const session = await getActiveSession();
  const demo = isDemoMode();

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <SessionProvider session={session}>
          <QueryProvider>
            <RegisterPWA />
            <UpdateBanner />
            {demo && <DemoBanner />}
            {children}
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
