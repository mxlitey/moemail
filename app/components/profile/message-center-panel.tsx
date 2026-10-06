"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Bell } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { DEFAULT_WELCOME_TEMPLATE, MESSAGE_PLACEHOLDERS } from "@/config"
import { BroadcastSection } from "./broadcast-section"

/**
 * 消息中心配置入口：集中管理用户收到的系统消息相关配置。
 *  - 欢迎消息：新用户开通消息中心时收到的第一条消息
 *  - 系统广播：向用户主动推送通知
 */
export function MessageCenterPanel() {
  const t = useTranslations("profile.messageCenter")
  const tWelcome = useTranslations("profile.welcome")
  const { toast } = useToast()

  const [welcomeSubject, setWelcomeSubject] = useState("")
  const [welcomeContent, setWelcomeContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config/message-center")
      if (!res.ok) return

      const data = (await res.json()) as {
        welcomeSubject?: string
        welcomeContent?: string
      }
      setWelcomeSubject(data.welcomeSubject ?? "")
      setWelcomeContent(data.welcomeContent ?? "")
    } catch (error) {
      console.error("Failed to fetch message center config:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveWelcome = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/config/message-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeSubject, welcomeContent }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || tWelcome("saveFailed"))
      }

      toast({
        title: tWelcome("saveSuccess"),
        description: tWelcome("saveSuccess"),
      })
    } catch (error) {
      toast({
        title: tWelcome("saveFailed"),
        description: error instanceof Error ? error.message : tWelcome("saveFailed"),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-background rounded-lg border-2 border-primary/20 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-6">{t("description")}</p>

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{tWelcome("title")}</h3>
          <p className="text-xs text-muted-foreground">{tWelcome("description")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="welcome-subject" className="text-sm font-medium">
            {tWelcome("subject")}
          </Label>
          <Input
            id="welcome-subject"
            value={welcomeSubject}
            onChange={(e) => setWelcomeSubject(e.target.value)}
            placeholder={DEFAULT_WELCOME_TEMPLATE.subject}
            disabled={loading || saving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="welcome-content" className="text-sm font-medium">
            {tWelcome("content")}
          </Label>
          <Textarea
            id="welcome-content"
            value={welcomeContent}
            onChange={(e) => setWelcomeContent(e.target.value)}
            placeholder={DEFAULT_WELCOME_TEMPLATE.content}
            rows={4}
            disabled={loading || saving}
          />
          <p className="text-xs text-muted-foreground">
            {tWelcome("placeholderHint", {
              placeholders: MESSAGE_PLACEHOLDERS.map((key) => `{${key}}`).join(" "),
            })}
          </p>
        </div>

        <Button onClick={handleSaveWelcome} disabled={loading || saving} className="w-full">
          {saving ? tWelcome("saving") : tWelcome("save")}
        </Button>
      </section>

      <div className="my-6 border-t border-dashed border-primary/30" />

      <BroadcastSection />
    </div>
  )
}