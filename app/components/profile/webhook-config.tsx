/* eslint-disable @typescript-eslint/no-unused-vars */
"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Send, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  WEBHOOK_PLACEHOLDERS,
  SAMPLE_MESSAGE,
  buildRequestBody,
  buildHeaders,
  type WebhookHeader,
} from "@/lib/webhook"
import { WEBHOOK_CONFIG } from "@/config"

// 默认请求头：可被用户修改或删除，清空后不再注入
const DEFAULT_HEADERS: WebhookHeader[] = [
  { key: "Content-Type", value: "application/json" },
]

// 请求体示例：语言无关的 JSON 片段，直接硬编码避免 ICU 花括号解析问题
const TEMPLATE_EXAMPLE = '{"subject": "{{subject}}", "content": "{{content}}"}'

export function WebhookConfig() {
  const t = useTranslations("profile.webhook")
  const tMessages = useTranslations("emails.messages")
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState("")
  const [template, setTemplate] = useState("")
  const [headers, setHeaders] = useState<WebhookHeader[]>(DEFAULT_HEADERS)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const { toast } = useToast()
  const templateRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch("/api/webhook")
      .then(res => res.json() as Promise<{ enabled: boolean; url: string; template: string; headers: WebhookHeader[] }>)
      .then(data => {
        setEnabled(data.enabled)
        setUrl(data.url)
        setTemplate(data.template ?? "")
        setHeaders(data.headers?.length ? data.headers : DEFAULT_HEADERS)
      })
      .catch(console.error)
      .finally(() => setInitialLoading(false))
  }, [])

  // 预览：与实际发送共用同一份渲染逻辑，保证展示一致
  const previewPayload = useMemo(() => ({
    event: WEBHOOK_CONFIG.EVENTS.NEW_MESSAGE,
    data: SAMPLE_MESSAGE,
  }), [])

  const previewBody = useMemo(() => {
    const raw = buildRequestBody(previewPayload, template)
    try {
      const pretty = JSON.stringify(JSON.parse(raw), null, 2)
      // 预览时把字符串内的转义换行还原为真实换行并按层级缩进，便于阅读
      // （仅影响展示，不影响实际发送的内容）
      return pretty
        .split("\n")
        .map((line) => {
          const indent = (line.match(/^\s*/) || [""])[0]
          return line.replace(/\\n/g, "\n" + indent + "  ")
        })
        .join("\n")
    } catch {
      return raw
    }
  }, [previewPayload, template])

  const previewHeaders = useMemo(() => buildHeaders(headers, previewPayload), [headers, previewPayload])

  const updateHeader = (index: number, patch: Partial<WebhookHeader>) => {
    setHeaders(prev => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)))
  }

  const addHeader = () => {
    setHeaders(prev => [...prev, { key: "", value: "" }])
  }

  const removeHeader = (index: number) => {
    setHeaders(prev => prev.filter((_, i) => i !== index))
  }

  // 在光标处插入占位符
  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`
    const el = templateRef.current
    if (!el) {
      setTemplate(prev => prev + token)
      return
    }
    const start = el.selectionStart ?? template.length
    const end = el.selectionEnd ?? template.length
    setTemplate(template.slice(0, start) + token + template.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  if (initialLoading) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{tMessages("loading")}</p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setLoading(true)
    try {
      const res = await fetch("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, enabled, template, headers })
      })

      if (!res.ok) throw new Error(t("saveFailed"))

      toast({
        title: t("saveSuccess"),
        description: t("saveSuccess")
      })
    } catch (_error) {
      toast({
        title: t("saveFailed"),
        description: t("saveFailed"),
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!url) return

    setTesting(true)
    try {
      const res = await fetch("/api/webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, template, headers })
      })

      if (!res.ok) throw new Error(t("testFailed"))

      toast({
        title: t("testSuccess"),
        description: t("testSuccess")
      })
    } catch (_error) {
      toast({
        title: t("testFailed"),
        description: t("testFailed"),
        variant: "destructive"
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>{t("enable")}</Label>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      {enabled && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">{t("url")}</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-url"
                placeholder={t("urlPlaceholder")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                type="url"
                required
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTest}
                      disabled={testing || !url}
                    >
                      {testing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("test")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("headers")}</Label>
            {headers.map((header, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={header.key}
                  onChange={(e) => updateHeader(index, { key: e.target.value })}
                  placeholder={t("headerKey")}
                  className="flex-1"
                />
                <Input
                  value={header.value}
                  onChange={(e) => updateHeader(index, { value: e.target.value })}
                  placeholder={t("headerValue")}
                  className="flex-1"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="flex-shrink-0"
                        onClick={() => removeHeader(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("removeHeader")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addHeader} className="gap-1">
              <Plus className="w-4 h-4" />
              {t("addHeader")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-template">{t("template")}</Label>
            <Textarea
              id="webhook-template"
              ref={templateRef}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder={TEMPLATE_EXAMPLE}
              className="min-h-[140px] font-mono text-xs"
            />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("placeholdersTitle")}</p>
              <div className="flex flex-wrap gap-1">
                {WEBHOOK_PLACEHOLDERS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => insertPlaceholder(key)}
                    title={t(`placeholders.${key}`)}
                    className="rounded-md border border-input px-2 py-0.5 text-xs font-mono text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {`{{${key}}}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {t("preview")}
            </button>

            {showPreview && (
              <div className="rounded-md bg-muted p-4 text-sm space-y-3">
                <div className="space-y-1">
                  <p>{t("previewHeaders")}</p>
                  <pre className="bg-background p-2 rounded text-xs overflow-auto">
                    {Object.entries(previewHeaders).map(([key, value]) => `${key}: ${value}`).join("\n") || t("noHeaders")}
                  </pre>
                </div>
                <div className="space-y-1">
                  <p>{t("previewBody")}</p>
                  <pre className="bg-background p-2 rounded text-xs overflow-auto">
                    {previewBody}
                  </pre>
                </div>
              </div>
            )}
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("saving") : t("save")}
          </Button>
        </div>
      )}
    </form>
  )
}