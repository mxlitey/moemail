"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

/** 用户名/密码用户的自助修改密码表单 */
export function ChangePassword() {
  const t = useTranslations("profile.changePassword")
  const { toast } = useToast()

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!currentPassword) {
      toast({ title: t("failed"), description: t("currentRequired"), variant: "destructive" })
      return
    }
    if (newPassword.length < 8) {
      toast({ title: t("failed"), description: t("tooShort"), variant: "destructive" })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t("failed"), description: t("mismatch"), variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || t("failed"))
      }

      toast({ title: t("success"), description: t("success") })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
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
      <div className="space-y-2">
        <Label htmlFor="current-password" className="text-sm font-medium">
          {t("current")}
        </Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={t("currentPlaceholder")}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-password" className="text-sm font-medium">
          {t("new")}
        </Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={t("newPlaceholder")}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password" className="text-sm font-medium">
          {t("confirm")}
        </Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t("confirmPlaceholder")}
          disabled={submitting}
        />
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  )
}