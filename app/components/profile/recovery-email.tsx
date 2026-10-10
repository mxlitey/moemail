"use client"

import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

/** 恢复邮箱绑定/换绑表单，用于忘记密码时接收重置链接 */
export function RecoveryEmail() {
  const t = useTranslations("profile.recoveryEmail")
  const { toast } = useToast()

  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    fetch("/api/user/recovery-email")
      .then((res) => (res.ok ? res.json() : { recoveryEmail: null }))
      .then((data: { recoveryEmail?: string | null }) => {
        if (active) setEmail(data.recoveryEmail ?? "")
      })
      .catch(() => {
        /* 读取失败时保持空值，用户可重新填写 */
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const trimmed = email.trim()
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: t("failed"), description: t("invalid"), variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/user/recovery-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryEmail: trimmed }),
      })

      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        recoveryEmail?: string | null
      }

      if (!res.ok) throw new Error(data.error || t("failed"))

      setEmail(data.recoveryEmail ?? "")
      toast({
        title: t("success"),
        description: data.recoveryEmail ? t("successBound") : t("successUnbound"),
      })
    } catch (error) {
      toast({
        title: t("failed"),
        description: error instanceof Error ? error.message : t("failed"),
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("description")}</p>

      <div className="space-y-2">
        <Label htmlFor="recovery-email" className="text-sm font-medium">
          {t("label")}
        </Label>
        <Input
          id="recovery-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("placeholder")}
          disabled={loading || submitting}
        />
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>

      <Button type="submit" disabled={loading || submitting} className="w-full">
        {submitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  )
}