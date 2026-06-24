import type { Metadata } from "next"
import { Geist, Geist_Mono, Inter, Noto_Sans_Arabic } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages, getTranslations } from "next-intl/server"

import "./globals.css"
import { cn } from "@/lib/utils"
import { Providers } from "@/components/providers"
import { ThemeProvider } from "@/components/theme-provider"
import { DirectionProvider } from "@/components/ui/direction"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata")

  return {
    title: t("title"),
    description: t("description"),
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()
  const dir = locale === "ar" ? "rtl" : "ltr"

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={cn(
        "h-full font-sans antialiased",
        geistSans.variable,
        geistMono.variable,
        inter.variable,
        notoSansArabic.variable,
        locale === "ar" && "font-[family-name:var(--font-arabic)]"
      )}
    >
      <body suppressHydrationWarning className="flex min-h-full flex-col">
        <Providers>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <DirectionProvider direction={dir}>
              <NextIntlClientProvider locale={locale} messages={messages}>
                <TooltipProvider delayDuration={0}>
                  {children}
                  <Toaster
                    position={dir === "rtl" ? "top-left" : "top-right"}
                  />
                </TooltipProvider>
              </NextIntlClientProvider>
            </DirectionProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  )
}
