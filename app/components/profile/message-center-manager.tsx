"use client"

import { useState, useEffect } from "react"
import type { ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { ChevronDown, Gauge, Globe, KeyRound, Mail, Megaphone, Send, UserCog } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  NOTIFICATION_EMAIL_PLACEHOLDERS,
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATE_TYPES,
  getNotificationPlaceholders,
  getResetEmailDefault,
} from "@/config"
import type { NotificationTemplateType } from "@/config"
import { cn } from "@/lib/utils"
import { BroadcastSection } from "./broadcast-section"

type TemplateValues = { subject: string; content: string }

/** 广播面板不落库为模板，单独作为折叠项使用固定的 key */
const BROADCAST_KEY = "broadcast"
/** 发件地址与重置密码邮件模板同样不是站内消息模板，单独使用固定 key */
const SENDER_KEY = "sender"
const RESET_EMAIL_KEY = "resetPasswordEmail"

/** 分组小标题：只做视觉分组，不参与折叠 */
const GROUP_LABEL_CLASS = "mb-1 text-xs font-semibold tracking-wide text-muted-foreground"

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

/** 面板内可折叠的一行：小图标 + 标题 + 箭头，展开后渲染表单 */
function SectionRow({
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
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 py-3 text-left"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{title}</span>
        </span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && <div className="pb-4">{children}</div>}
    </div>
  )
}

/**
 * 通知邮件配置：内联在个人中心的手风琴中，因此这里不再有页面壳与返回按钮。
 * 作为第二层，采用轻量列表样式（无卡片边框，分组小标题 + 分隔线），避免嵌套手风琴的视觉混淆。
 * 分为「邮件」（真正投递的邮件）与「站内通知」（写入系统收件箱）两组，同一时间只展开一项。
 */
export function MessageCenterManager() {
  const t = useTranslations("profile.notificationTemplates")
  const tBroadcast = useTranslations("profile.broadcast")
  const locale = useLocale()
  const { toast } = useToast()

  const [templates, setTemplates] =
    useState<Record<NotificationTemplateType, TemplateValues>>(EMPTY_TEMPLATES)
  const [sender, setSender] = useState("")
  const [domains, setDomains] = useState<string[]>([])
  const [emailTemplate, setEmailTemplate] = useState<TemplateValues>({ subject: "", content: "" })
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState<NotificationTemplateType | null>(null)
  const [savingSender, setSavingSender] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  // 同一时间只允许一项展开
  const [openKey, setOpenKey] = useState<string | null>(null)

  // 未配置时以当前界面语言的默认模板作为灰色占位提示
  const emailDefaults = getResetEmailDefault(locale)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config/message-center")
      if (!res.ok) return

      const data = (await res.json()) as {
        templates?: Partial<Record<NotificationTemplateType, TemplateValues>>
        sender?: string
        emailTemplate?: TemplateValues
        domains?: string[]
      }
      setTemplates((prev) => ({ ...prev, ...(data.templates ?? {}) }))
      setSender(data.sender ?? "")
      setDomains(data.domains ?? [])
      setEmailTemplate(data.emailTemplate ?? { subject: "", content: "" })
    } catch (error) {
      console.error("Failed to fetch notification config:", error)
    } finally {
      setLoading(false)
    }
  }

  /** 统一处理保存请求，避免三个保存入口重复写 catch 分支 */
  const postConfig = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/config/message-center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error || t("saveFailed"))
    }
  }

  const showSaved = () => toast({ title: t("saveSuccess"), description: t("saveSuccess") })

  const showSaveError = (error: unknown) => {
    toast({
      title: t("saveFailed"),
      description: error instanceof Error ? error.message : t("saveFailed"),
      variant: "destructive",
    })
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
      await postConfig({ templates: { [type]: templates[type] } })
      showSaved()
    } catch (error) {
      showSaveError(error)
    } finally {
      setSavingType(null)
    }
  }

  const handleSaveSender = async () => {
    setSavingSender(true)
    try {
      await postConfig({ sender })
      showSaved()
    } catch (error) {
      showSaveError(error)
    } finally {
      setSavingSender(false)
    }
  }

  const handleSaveEmail = async () => {
    setSavingEmail(true)
    try {
      await postConfig({ emailTemplate })
      showSaved()
    } catch (error) {
      showSaveError(error)
    } finally {
      setSavingEmail(false)
    }
  }

  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key))

  return (
    <div>
      {/* 邮件组：直接投递到用户邮箱的系统邮件 */}
      <section>
        <p className={GROUP_LABEL_CLASS}>{t("groups.email")}</p>
        <div className="divide-y divide-border">
          <SectionRow
            icon={Send}
            title={t("emailSender.title")}
            isOpen={openKey === SENDER_KEY}
            onToggle={() => toggle(SENDER_KEY)}
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="notification-sender" className="text-sm font-medium">
                  {t("emailSender.label")}
                </Label>
                <Input
                  id="notification-sender"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  placeholder={t("emailSender.placeholder")}
                  disabled={loading || savingSender}
                />
                <p className="text-xs text-muted-foreground">
                  {domains.length
                    ? t("emailSender.hint", { domains: domains.join(" · ") })
                    : t("emailSender.domainsEmpty")}
                </p>
              </div>

              <Button
                onClick={handleSaveSender}
                disabled={loading || savingSender}
                className="w-full"
              >
                {savingSender ? t("saving") : t("save")}
              </Button>
            </div>
          </SectionRow>

          <SectionRow
            icon={Mail}
            title={t("resetEmail.title")}
            isOpen={openKey === RESET_EMAIL_KEY}
            onToggle={() => toggle(RESET_EMAIL_KEY)}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email-subject" className="text-sm font-medium">
                  {t("subject")}
                </Label>
                <Input
                  id="reset-email-subject"
                  value={emailTemplate.subject}
                  onChange={(e) =>
                    setEmailTemplate((prev) => ({ ...prev, subject: e.target.value }))
                  }
                  placeholder={emailDefaults.subject}
                  disabled={loading || savingEmail}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-email-content" className="text-sm font-medium">
                  {t("content")}
                </Label>
                <Textarea
                  id="reset-email-content"
                  value={emailTemplate.content}
                  onChange={(e) =>
                    setEmailTemplate((prev) => ({ ...prev, content: e.target.value }))
                  }
                  placeholder={emailDefaults.content.replace(/\s+/g, " ")}
                  rows={6}
                  disabled={loading || savingEmail}
                />
                <p className="text-xs text-muted-foreground">
                  {t("resetEmail.contentHint", {
                    placeholders: NOTIFICATION_EMAIL_PLACEHOLDERS.map((key) => `{${key}}`).join(" "),
                  })}
                </p>
              </div>

              <Button
                onClick={handleSaveEmail}
                disabled={loading || savingEmail}
                className="w-full"
              >
                {savingEmail ? t("saving") : t("save")}
              </Button>
            </div>
          </SectionRow>
        </div>
      </section>

      {/* 站内通知组：写入系统收件箱的消息模板与广播 */}
      <section className="mt-6">
        <p className={GROUP_LABEL_CLASS}>{t("groups.inApp")}</p>
        <div className="divide-y divide-border">
          {NOTIFICATION_TEMPLATE_TYPES.map((type) => {
            const Icon = SECTION_ICONS[type]
            const isOpen = openKey === type
            const defaults = NOTIFICATION_TEMPLATES[type]
            const saving = savingType === type

            return (
              <SectionRow
                key={type}
                icon={Icon}
                title={t(`sections.${type}.title` as any)}
                isOpen={isOpen}
                onToggle={() => toggle(type)}
              >
                <div className="space-y-4">
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
              </SectionRow>
            )
          })}

          <SectionRow
            icon={Megaphone}
            title={tBroadcast("title")}
            isOpen={openKey === BROADCAST_KEY}
            onToggle={() => toggle(BROADCAST_KEY)}
          >
            <BroadcastSection />
          </SectionRow>
        </div>
      </section>
    </div>
  )
}