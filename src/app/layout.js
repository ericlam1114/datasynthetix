import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner"

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "data synthetix - Generate High-Quality Synthetic Training Data",
  description:
    "Transform your documents into fine-tuning ready synthetic data with our AI-powered platform. No manual cleanup required.",
};

export default function RootLayout({ children }) {
  // Check if we're in development mode
  const isDev = process.env.NODE_ENV === 'development';
  
  return (
    <html lang="en">
      <head>
        {/* Load test helpers in development mode */}
        {isDev && (
          <script src="/tests/test-helpers.js" defer></script>
        )}
      </head>
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
