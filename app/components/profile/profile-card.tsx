"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { User } from "next-auth"
import { useTranslations } from "next-intl"
import Image from "next/image"
import {
  Github,
  Settings,
  Crown,
  Sword,
  User2,
  Gem,
  Bell,
  ChevronDown,
  Globe,
  Zap,
  Key,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { WebhookConfig } from "./webhook-config"
import { EmailServiceConfig } from "./email-service-config"
import { useRolePermission } from "@/hooks/use-role-permission"
import { PERMISSIONS } from "@/lib/permissions"
import { WebsiteConfigPanel } from "./website-config-panel"
import { ApiKeyPanel } from "./api-key-panel"
import { MessageCenterManager } from "./message-center-manager"
import { RolesManager } from "./roles-manager"
import { ChangePassword } from "./change-password"
import { RecoveryEmail } from "./recovery-email"
import { cn } from "@/lib/utils"

interface ProfileCardProps {
  user: User
}

const roleConfigs = {
  emperor: { key: 'EMPEROR', icon: Crown },
  duke: { key: 'DUKE', icon: Gem },
  knight: { key: 'KNIGHT', icon: Sword },
  civilian: { key: 'CIVILIAN', icon: User2 },
} as const

const providerConfigs = {
  google: {
    label: "Google",
    className: "text-red-500 bg-red-500/10",
    icon: (props: any) => (
      <svg viewBox="0 0 24 24" {...props}>
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  github: {
    label: "GitHub",
    className: "text-primary bg-primary/10",
    icon: Github,
  },
} as const

type SectionKey =
  | "account"
  | "webhook"
  | "website"
  | "emailService"
  | "apiKey"
  | "messageCenter"
  | "roles"

/** 顶层折叠项：同一时间只展开一项由父组件通过 openKey 控制 */
function AccordionSection({
  icon: Icon,
  title,
  isOpen,
  onToggle,
  children,
}: {
  icon: LucideIcon
  title: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="bg-background rounded-lg border-2 border-primary/20">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 p-6 text-left"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <span className="text-lg font-semibold">{title}</span>
        </span>
        <ChevronDown className={cn("w-5 h-5 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && <div className="px-6 pb-6">{children}</div>}
    </section>
  )
}

export function ProfileCard({ user }: ProfileCardProps) {
  const t = useTranslations("profile.card")
  const tPromote = useTranslations("profile.roles")
  const tAuth = useTranslations("auth.signButton")
  const tWebhook = useTranslations("profile.webhook")
  const tMessageCenter = useTranslations("profile.messageCenter")
  const tWebsite = useTranslations("profile.website")
  const tEmailService = useTranslations("profile.emailService")
  const tApiKey = useTranslations("profile.apiKey")
  const tChangePassword = useTranslations("profile.changePassword")
  const tRecoveryEmail = useTranslations("profile.recoveryEmail")
  const { checkPermission } = useRolePermission()
  const canManageWebhook = checkPermission(PERMISSIONS.MANAGE_WEBHOOK)
  const canPromote = checkPermission(PERMISSIONS.PROMOTE_USER)
  const canManageConfig = checkPermission(PERMISSIONS.MANAGE_CONFIG)

  // 顶层手风琴：同一时间只展开一项
  const [openKey, setOpenKey] = useState<SectionKey | null>(null)
  const toggle = (key: SectionKey) => setOpenKey((prev) => (prev === key ? null : key))

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 用户信息卡整块可点击：展开后才显示恢复邮箱与修改密码 */}
      <section className="bg-background rounded-lg border-2 border-primary/20">
        <button
          type="button"
          onClick={() => toggle("account")}
          className="w-full flex items-center gap-6 p-6 text-left"
          aria-expanded={openKey === "account"}
        >
          <span className="relative flex-shrink-0">
            {user.image && (
              <Image
                src={user.image}
                alt={user.name || tAuth("userAvatar")}
                width={80}
                height={80}
                className="rounded-full ring-2 ring-primary/20"
              />
            )}
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-xl font-bold truncate">{user.name}</span>
              {!!user?.providers?.length && (
                <span className="flex gap-2">
                  {user.providers.map((provider) => {
                    const config = providerConfigs[provider as keyof typeof providerConfigs]
                    if (!config) return null
                    const Icon = config.icon
                    return (
                      <span
                        key={provider}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${config.className}`}
                      >
                        <Icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    )
                  })}
                </span>
              )}
            </span>
            <span className="block text-sm text-muted-foreground truncate mt-1">
              {
                user.email ? user.email : `${t("name")}: ${user.username}`
              }
            </span>
            {user.roles && (
              <span className="flex gap-2 mt-2">
                {user.roles.map(({ name }) => {
                  const roleConfig = roleConfigs[name as keyof typeof roleConfigs]
                  const Icon = roleConfig.icon
                  const roleName = t(`roles.${roleConfig.key}` as any)
                  return (
                    <span
                      key={name}
                      className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                      title={roleName}
                    >
                      <Icon className="w-3 h-3" />
                      {roleName}
                    </span>
                  )
                })}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "w-5 h-5 flex-shrink-0 text-muted-foreground transition-transform",
              openKey === "account" && "rotate-180"
            )}
          />
        </button>

        {openKey === "account" && (
          <div className="px-6 pb-6 space-y-6">
            <div className="border-t pt-6 space-y-3">
              <h3 className="text-sm font-semibold">{tRecoveryEmail("title")}</h3>
              <RecoveryEmail />
            </div>

            {user.hasPassword && (
              <div className="border-t pt-6 space-y-3">
                <h3 className="text-sm font-semibold">{tChangePassword("title")}</h3>
                <ChangePassword />
              </div>
            )}
          </div>
        )}
      </section>

      {canManageWebhook && (
        <AccordionSection
          icon={Settings}
          title={tWebhook("title")}
          isOpen={openKey === "webhook"}
          onToggle={() => toggle("webhook")}
        >
          <WebhookConfig />
        </AccordionSection>
      )}

      {canManageConfig && (
        <AccordionSection
          icon={Globe}
          title={tWebsite("title")}
          isOpen={openKey === "website"}
          onToggle={() => toggle("website")}
        >
          <WebsiteConfigPanel />
        </AccordionSection>
      )}

      {canManageConfig && (
        <AccordionSection
          icon={Zap}
          title={tEmailService("title")}
          isOpen={openKey === "emailService"}
          onToggle={() => toggle("emailService")}
        >
          <EmailServiceConfig />
        </AccordionSection>
      )}

      {canManageWebhook && (
        <AccordionSection
          icon={Key}
          title={tApiKey("title")}
          isOpen={openKey === "apiKey"}
          onToggle={() => toggle("apiKey")}
        >
          <ApiKeyPanel />
        </AccordionSection>
      )}

      {canManageConfig && (
        <AccordionSection
          icon={Bell}
          title={tMessageCenter("title")}
          isOpen={openKey === "messageCenter"}
          onToggle={() => toggle("messageCenter")}
        >
          <MessageCenterManager />
        </AccordionSection>
      )}

      {canPromote && (
        <AccordionSection
          icon={Crown}
          title={tPromote("title")}
          isOpen={openKey === "roles"}
          onToggle={() => toggle("roles")}
        >
          <RolesManager currentUserId={user.id!} />
        </AccordionSection>
      )}
    </div>
  )
}