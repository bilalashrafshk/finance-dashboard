import type React from "react"
import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/lib/auth/auth-context"
import { Toaster } from "@/components/ui/toaster"
import Footer from "@/components/footer"
import "./globals.css"

export const metadata: Metadata = {
  title: "Conviction Pays - Risk Dashboard",
  description: "Investment risk analysis and portfolio management by Conviction Pays",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            {children}
            <Footer />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
