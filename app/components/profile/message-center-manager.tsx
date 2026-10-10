"use client"

import { useState, useEffect } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  ChevronDown,
  Gauge,
  Globe,
  KeyRound,
  Mail,
  Megaphone,
  UserCog,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATE_TYPES,
  getNotificationPlaceholders,
} from "@/config"
import type { NotificationTemplateType } from "@/config"
import { cn } from "@/lib/utils"
import { BroadcastSection } from "./broadcast-section"

type TemplateValues = { subject: string; content: string }

/** 广播面板不落库为模板，单独作为折叠项使用固定的 key */
const BROADCAST_KEY = "broadcast"

const SECTION_ICONS: Record<NotificationTemplateType, LucideIcon> = {
  welcome: Mail,
  roleChange: UserCog,
  passwordReset: KeyRound,
  quotaChange: Gauge,
  domainChanged: Globe,
}

const EMPTY_TEMPLATES = Object.fromEntries(
  NOTIFICATION_TEMPLATE_TYPES.map((type) => [type, { subject: "", content: "" }])
) as Record<NotificationTemplateType, TemplateValues>

/**
 * 消息中心配置页：集中管理用户收到的系统消息相关配置。
 *  - 7 类系统通知：可自定义标题/正文模板
 *  - 系统广播：向用户主动推送通知
 *
 * 全部条目以折叠面板呈现，同一时间只展开一项，避免页面过长。
 */
export function MessageCenterManager() {
  const t = useTranslations("profile.notificationTemplates")
  const tBroadcast = useTranslations("profile.broadcast")
  const tNav = useTranslations("common.nav")
  const router = useRouter()
  const locale = useLocale()
  const { toast } = useToast()

  const [templates, setTemplates] =
    useState<Record<NotificationTemplateType, TemplateValues>>(EMPTY_TEMPLATES)
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState<NotificationTemplateType | null>(null)
  // 同一时间只允许一项展开
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config/message-center")
      if (!res.ok) return

      const data = (await res.json()) as {
        templates?: Partial<Record<NotificationTemplateType, TemplateValues>>
      }
      setTemplates((prev) => ({ ...prev, ...(data.templates ?? {}) }))
    } catch (error) {
      console.error("Failed to fetch message center config:", error)
    } finally {
      setLoading(false)
    }
  }

  const updateField = (
    type: NotificationTemplateType,
    field: keyof TemplateValues,
    value: string
  ) => {
    setTemplates((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }))
  }

  const handleSave = async (type: NotificationTemplateType) => {
    setSavingType(type)
    try {
      const res = await fetch("/api/config/message-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: { [type]: templates[type] } }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || t("saveFailed"))
      }

      toast({
        title: t("saveSuccess"),
        description: t("saveSuccess"),
      })
    } catch (error) {
      toast({
        title: t("saveFailed"),
        description: error instanceof Error ? error.message : t("saveFailed"),
        variant: "destructive",
      })
    } finally {
      setSavingType(null)
    }
  }

  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Button onClick={() => router.push(`/${locale}/profile`)} className="gap-2">
        <ArrowLeft className="w-4 h-4" />
        {tNav("backToProfile")}
      </Button>

      <div className="space-y-3">
        {NOTIFICATION_TEMPLATE_TYPES.map((type) => {
          const Icon = SECTION_ICONS[type]
          const isOpen = openKey === type
          const defaults = NOTIFICATION_TEMPLATES[type]
          const saving = savingType === type

          return (
            <section key={type} className="bg-background rounded-lg border-2 border-primary/20">
              <button
                type="button"
                onClick={() => toggle(type)}
                className="w-full flex items-center justify-between gap-2 p-4 text-left"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-primary" />
                  <span className="text-lg font-semibold">
                    {t(`sections.${type}.title` as any)}
                  </span>
                </span>
                <ChevronDown
                  className={cn("w-5 h-5 transition-transform", isOpen && "rotate-180")}
                />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${type}-subject`} className="text-sm font-medium">
                      {t("subject")}
                    </Label>
                    <Input
                      id={`${type}-subject`}
                      value={templates[type].subject}
                      onChange={(e) => updateField(type, "subject", e.target.value)}
                      placeholder={defaults.defaultSubject}
                      disabled={loading || saving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${type}-content`} className="text-sm font-medium">
                      {t("content")}
                    </Label>
                    <Textarea
                      id={`${type}-content`}
                      value={templates[type].content}
                      onChange={(e) => updateField(type, "content", e.target.value)}
                      placeholder={defaults.defaultContent}
                      rows={4}
                      disabled={loading || saving}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("placeholderHint", {
                        placeholders: getNotificationPlaceholders(type)
                          .map((key) => `{${key}}`)
                          .join(" "),
                      })}
                    </p>
                  </div>

                  <Button
                    onClick={() => handleSave(type)}
                    disabled={loading || saving}
                    className="w-full"
                  >
                    {saving ? t("saving") : t("save")}
                  </Button>
                </div>
              )}
            </section>
          )
        })}

        <section className="bg-background rounded-lg border-2 border-primary/20">
          <button
            type="button"
            onClick={() => toggle(BROADCAST_KEY)}
            className="w-full flex items-center justify-between gap-2 p-4 text-left"
            aria-expanded={openKey === BROADCAST_KEY}
          >
            <span className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              <span className="text-lg font-semibold">{tBroadcast("title")}</span>
            </span>
            <ChevronDown
              className={cn(
                "w-5 h-5 transition-transform",
                openKey === BROADCAST_KEY && "rotate-180"
              )}
            />
          </button>

          {openKey === BROADCAST_KEY && (
            <div className="px-4 pb-4">
              <BroadcastSection />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}