"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface ResetPasswordFormProps {
  token: string
}

/** 重置密码：校验令牌后设置新密码 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const t = useTranslations("auth.resetPassword")
  const locale = useLocale()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")

    if (password.length < 8) {
      setError(t("errors.tooShort"))
      return
    }
    if (password !== confirmPassword) {
      setError(t("errors.mismatch"))
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })

      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || t("failed"))

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-[95%] max-w-lg border-2 border-primary/20">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-center bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
          {t("title")}
        </CardTitle>
        <CardDescription className="text-center">{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="px-6 space-y-4">
        {success ? (
          <p className="text-sm text-muted-foreground text-center">{t("successDescription")}</p>
        ) : !token ? (
          <p className="text-sm text-destructive text-center">{t("missingToken")}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-password" className="text-sm font-medium">
                {t("password")}
              </Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-confirm-password" className="text-sm font-medium">
                {t("confirmPassword")}
              </Label>
              <Input
                id="reset-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("confirmPasswordPlaceholder")}
                disabled={loading}
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("submit")}
            </Button>
          </form>
        )}

        <div className="text-center">
          <Link
            href={`/${locale}/login`}
            className="text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            {t("backToLogin")}
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}