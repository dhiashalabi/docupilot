import { cookies } from "next/headers"
import { hasLocale } from "next-intl"
import { getRequestConfig } from "next-intl/server"

const supportedLocales = ["en", "ar"] as const

export default getRequestConfig(async () => {
  const store = await cookies()
  const cookieLocale = store.get("locale")?.value
  const locale = hasLocale(supportedLocales, cookieLocale) ? cookieLocale : "en"

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
