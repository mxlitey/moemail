import { Header } from "@/components/layout/header"
import { MessageCenterManager } from "@/components/profile/message-center-manager"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import type { Locale } from "@/i18n/config"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"

export const runtime = "edge"

export default async function MessageCenterPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: localeFromParams } = await params
  const locale = localeFromParams as Locale
  const session = await auth()

  if (!session?.user) {
    redirect(`/${locale}`)
  }

  const canManageConfig = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!canManageConfig) {
    redirect(`/${locale}/profile`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 lg:px-8 max-w-[1600px]">
        <Header />
        <main className="pt-20 pb-5">
          <MessageCenterManager />
        </main>
      </div>
    </div>
  )
}