"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Loader2, Mail } from "lucide-react"

/** 忘记密码：提交用户名或恢复邮箱，服务端仅向已绑定邮箱发送重置链接 */
export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword")
  const locale = useLocale()

  const [identifier, setIdentifier] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!identifier.trim() || loading) return

    setLoading(true)
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), locale }),
      })
      // 服务端始终返回同一结果，这里也统一提示，避免泄露账号是否存在
      setSubmitted(true)
    } catch {
      setSubmitted(true)
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
        {submitted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">{t("sentDescription")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                <Mail className="h-5 w-5" />
              </div>
              <Input
                className="h-10 pl-9 pr-3"
                placeholder={t("identifierPlaceholder")}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading || !identifier.trim()}>
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