import type { Metadata } from "next";
import { Geist_Mono, Heebo, Rubik } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TRPCReactProvider } from "@/trpc/client";
import { cn } from "@/lib/utils";

const rubikHeading = Rubik({
  subsets: ["latin", "hebrew"],
  variable: "--font-heading",
});

const heeboSans = Heebo({
  subsets: ["latin", "hebrew"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "משימות צוות",
  description: "רשימות משימות לפי חדר ללא הרשמה.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      suppressHydrationWarning
      className={cn("h-full", heeboSans.variable, geistMono.variable, rubikHeading.variable, "font-sans")}
    >
      <body className="min-h-full flex flex-col antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TRPCReactProvider>
            {children}
            <Toaster richColors closeButton position="top-center" dir="rtl" />
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
