import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

import { ThemeProvider } from "@/components/ThemeProvider";
import { Open_Sans, Poppins } from "next/font/google";

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
});

const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fretbox Outreach AI",
  description: "AI-powered university outreach automation",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Fretbox Outreach AI",
    description: "Automate your university outreach with intelligent insights, automated enrichment, and data-driven engagement.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fretbox Outreach AI",
    description: "Automate your university outreach with intelligent insights, automated enrichment, and data-driven engagement.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${openSans.variable} ${poppins.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
