"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { ChevronDown, Gauge, Globe, KeyRound, Mail, Megaphone, UserCog } from "lucide-react"
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
 * 消息中心配置：内联在个人中心的手风琴中，因此这里不再有页面壳与返回按钮。
 * 作为第二层，采用轻量列表样式（无卡片边框，小标题 + 分隔线），避免嵌套手风琴的视觉混淆。
 * 同一时间只展开一项。
 */
export function MessageCenterManager() {
  const t = useTranslations("profile.notificationTemplates")
  const tBroadcast = useTranslations("profile.broadcast")
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
    <div>
      {NOTIFICATION_TEMPLATE_TYPES.map((type) => {
        const Icon = SECTION_ICONS[type]
        const isOpen = openKey === type
        const defaults = NOTIFICATION_TEMPLATES[type]
        const saving = savingType === type

        return (
          <div key={type} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => toggle(type)}
              className="w-full flex items-center justify-between gap-2 py-3 text-left"
              aria-expanded={isOpen}
            >
              <span className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{t(`sections.${type}.title` as any)}</span>
              </span>
              <ChevronDown
                className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")}
              />
            </button>

            {isOpen && (
              <div className="pb-4 space-y-4">
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
          </div>
        )
      })}

      <div className="border-b border-border last:border-b-0">
        <button
          type="button"
          onClick={() => toggle(BROADCAST_KEY)}
          className="w-full flex items-center justify-between gap-2 py-3 text-left"
          aria-expanded={openKey === BROADCAST_KEY}
        >
          <span className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{tBroadcast("title")}</span>
          </span>
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform",
              openKey === BROADCAST_KEY && "rotate-180"
            )}
          />
        </button>

        {openKey === BROADCAST_KEY && (
          <div className="pb-4">
            <BroadcastSection />
          </div>
        )}
      </div>
    </div>
  )
}