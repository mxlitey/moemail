import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import type { Locale } from "@/i18n/config"

export const runtime = "edge"

/** 站点根路由不再展示欢迎页：已登录直接进入邮箱，未登录前往登录页 */
export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: localeFromParams } = await params
  const locale = localeFromParams as Locale
  const session = await auth()

  redirect(session?.user ? `/${locale}/moe` : `/${locale}/login`)
}