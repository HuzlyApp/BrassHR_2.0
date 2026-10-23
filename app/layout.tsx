import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Poppins, Roboto, Ubuntu } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ReactQueryProvider from "@/app/components/ReactQueryProvider";
import TenantBrandingRoot from "@/app/components/tenant/TenantBrandingRoot";
import TenantBrandingHead from "@/app/components/tenant/TenantBrandingHead";
import IdleSessionGuard from "@/app/components/IdleSessionGuard";
import AuthSessionSync from "@/app/components/AuthSessionSync";
import { BRAAS_PLATFORM_FAVICON } from "@/lib/tenant/tenant-branding";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const tenantBrandingInter = Inter({
  subsets: ["latin"],
  variable: "--font-tenant-branding-inter",
  display: "swap",
});

const tenantBrandingRoboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-tenant-branding-roboto",
  display: "swap",
});

const tenantBrandingPoppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-tenant-branding-poppins",
  display: "swap",
});

const tenantBrandingUbuntu = Ubuntu({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-tenant-branding-ubuntu",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brass HR",
  description: "Configurable applicant and recruiter onboarding for healthcare staffing teams.",
  icons: {
    icon: BRAAS_PLATFORM_FAVICON,
    shortcut: BRAAS_PLATFORM_FAVICON,
    apple: BRAAS_PLATFORM_FAVICON,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`
          ${geistSans.variable}
          ${geistMono.variable}
          ${tenantBrandingInter.variable}
          ${tenantBrandingRoboto.variable}
          ${tenantBrandingPoppins.variable}
          ${tenantBrandingUbuntu.variable}
          antialiased
          bg-white
          text-gray-900
          min-h-screen
        `}
      >
        <TenantBrandingHead />
        <ReactQueryProvider>
          <AuthSessionSync />
          <IdleSessionGuard />
          <TenantBrandingRoot>{children}</TenantBrandingRoot>
          <Toaster
            position="top-right"
            containerStyle={{ zIndex: 100000 }}
            toastOptions={{ duration: 4000 }}
          />
        </ReactQueryProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}