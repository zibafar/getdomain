import type { Metadata } from "next";
import { Geist, Geist_Mono, Vazirmatn } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const vazir = Vazirmatn({ variable: "--font-vazir", subsets: ["arabic"] });

export const metadata: Metadata = {
  title: "DomainForge — AI domain finder",
  description: "AI-generated domain ideas with verified availability, .ir first.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${vazir.variable} antialiased`}>
        {children}
        <Toaster richColors position="bottom-center" />
      </body>
    </html>
  );
}
