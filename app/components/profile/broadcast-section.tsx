"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Megaphone } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ROLES } from "@/lib/permissions"
import { MESSAGE_PLACEHOLDERS } from "@/config"

type BroadcastRole = "all" | "emperor" | "duke" | "knight" | "civilian"

const ROLE_OPTIONS: BroadcastRole[] = [
  "all",
  ROLES.EMPEROR,
  ROLES.DUKE,
  ROLES.KNIGHT,
  ROLES.CIVILIAN,
]

export function BroadcastSection() {
  const t = useTranslations("profile.broadcast")
  const tCard = useTranslations("profile.card")
  const tCommon = useTranslations("common.actions")
  const { toast } = useToast()

  const [role, setRole] = useState<BroadcastRole>("all")
  const [subject, setSubject] = useState("")
  const [content, setContent] = useState("")
  const [estimate, setEstimate] = useState<{ total: number; chunks: number } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(0)

  const roleLabel = (value: BroadcastRole) =>
    value === "all" ? t("roleAll") : tCard(`roles.${value.toUpperCase()}` as any)

  const fetchEstimate = useCallback(async (target: BroadcastRole) => {
    try {
      const res = await fetch(`/api/system-messages/broadcast?role=${target}`)
      if (res.ok) {
        const data = (await res.json()) as { total: number; chunks: number }
        setEstimate(data)
      }
    } catch (error) {
      console.error("Failed to fetch broadcast estimate:", error)
    }
  }, [])

  useEffect(() => {
    fetchEstimate(role)
  }, [role, fetchEstimate])

  const canSend = !sending && !!subject.trim() && !!content.trim() && !!estimate

  const handleConfirm = async () => {
    setConfirmOpen(false)
    setSending(true)
    setSent(0)

    try {
      let cursor: string | null = null
      let totalSent = 0
      let done = false

      // 客户端分页驱动：每批处理 CHUNK_SIZE 位用户，直到服务端返回 done
      while (!done) {
        const res = await fetch("/api/system-messages/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: subject.trim(), content, role, cursor }),
        })

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || t("sendFailed"))
        }

        const data = (await res.json()) as {
          done: boolean
          nextCursor: string | null
          sent: number
        }

        totalSent += data.sent
        setSent(totalSent)
        done = data.done
        cursor = data.nextCursor

        if (!cursor) break
      }

      toast({
        title: t("sendSuccess"),
        description: t("sendSuccessDescription", { count: totalSent }),
      })
      setSubject("")
      setContent("")
      fetchEstimate(role)
    } catch (error) {
      toast({
        title: t("sendFailed"),
        description: error instanceof Error ? error.message : t("sendFailed"),
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>

      <p className="text-sm text-muted-foreground">{t("description")}</p>

      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("role")}</Label>
        <Select value={role} onValueChange={(value) => setRole(value as BroadcastRole)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {roleLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="broadcast-subject" className="text-sm font-medium">
          {t("subject")}
        </Label>
        <Input
          id="broadcast-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("subjectPlaceholder")}
          disabled={sending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="broadcast-content" className="text-sm font-medium">
          {t("content")}
        </Label>
        <Textarea
          id="broadcast-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("contentPlaceholder")}
          rows={5}
          disabled={sending}
        />
        <p className="text-xs text-muted-foreground">
          {t("placeholderHint", {
            placeholders: MESSAGE_PLACEHOLDERS.map((key) => `{${key}}`).join(" "),
          })}
        </p>
      </div>

      {estimate && (
        <p className="text-xs text-muted-foreground">
          {sending
            ? t("sending", { done: sent, total: estimate.total })
            : t("estimate", { count: estimate.total, chunks: estimate.chunks })}
        </p>
      )}

      <Button onClick={() => setConfirmOpen(true)} disabled={!canSend} className="w-full">
        {sending ? t("sending", { done: sent, total: estimate?.total ?? 0 }) : t("send")}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDescription", {
                count: estimate?.total ?? 0,
                chunks: estimate?.chunks ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>{t("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
