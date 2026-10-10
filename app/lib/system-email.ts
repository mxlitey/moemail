/**
 * 系统邮件的发送辅助（与用户发件链路相互独立）。
 *
 * 发件地址由管理员在「通知邮件」中配置（KV: NOTIFICATION_EMAIL_FROM），
 * 其域名必须已在「Resend 发件服务配置」中配好 API Key，才能取到发送密钥。
 */

import {
  NOTIFICATION_EMAIL_FROM_KEY,
  NOTIFICATION_EMAIL_TEMPLATES,
  getResetEmailDefault,
  renderNotificationEmailTemplate,
} from "@/config"
import type { NotificationEmailType } from "@/config"

const RESEND_API_KEYS_KEY = "RESEND_API_KEYS"

export type SystemSender = {
  from: string
  apiKey: string
}

/** 读取域名 → Resend API Key 映射，配置缺失或格式错误时返回空对象 */
async function readResendKeys(siteConfig: KVNamespace): Promise<Record<string, string>> {
  const raw = await siteConfig.get(RESEND_API_KEYS_KEY)
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, string>
  } catch (error) {
    console.error("Failed to parse resend domain keys:", error)
    return {}
  }
}

/** 已配置 Resend API Key 的域名列表，供发件地址配置下拉提示 */
export async function listResendDomains(siteConfig: KVNamespace): Promise<string[]> {
  const map = await readResendKeys(siteConfig)
  return Object.entries(map)
    .filter(([domain, apiKey]) => domain && apiKey)
    .map(([domain]) => domain)
}

/**
 * 解析系统发件配置：未启用发件服务、未配置发件地址，
 * 或发件地址的域名没有对应 API Key 时返回 null。
 */
export async function getSystemSender(siteConfig: KVNamespace): Promise<SystemSender | null> {
  const enabled = await siteConfig.get("EMAIL_SERVICE_ENABLED")
  if (enabled !== "true") return null

  const from = (await siteConfig.get(NOTIFICATION_EMAIL_FROM_KEY))?.trim()
  if (!from) return null

  const separator = from.lastIndexOf("@")
  const domain = separator > 0 ? from.slice(separator + 1) : ""
  if (!domain) return null

  const apiKey = (await readResendKeys(siteConfig))[domain]
  if (!apiKey) return null

  return { from, apiKey }
}

/**
 * 读取通知邮件模板（管理员配置优先，留空回退内置默认）并渲染占位符。
 * 目前仅重置密码邮件一种类型，其默认文案按站点语言选择。
 */
export async function loadNotificationEmail(
  siteConfig: KVNamespace,
  type: NotificationEmailType,
  locale: string,
  values: Record<string, string>
): Promise<{ subject: string; content: string }> {
  const { subjectKey, contentKey } = NOTIFICATION_EMAIL_TEMPLATES[type]
  const fallback = getResetEmailDefault(locale)

  const [storedSubject, storedContent] = await Promise.all([
    siteConfig.get(subjectKey),
    siteConfig.get(contentKey),
  ])

  const subject = storedSubject?.trim() || fallback.subject
  const content = storedContent?.trim() || fallback.content

  return {
    subject: renderNotificationEmailTemplate(subject, values),
    content: renderNotificationEmailTemplate(content, values),
  }
}

/**
 * 通过 Resend 发送系统邮件。
 * 发送失败仅记录日志并返回 false，不向上抛出，避免影响主流程。
 */
export async function sendSystemEmail(
  siteConfig: KVNamespace,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const sender = await getSystemSender(siteConfig)
  if (!sender) {
    console.error("System email skipped: notification sender not configured")
    return false
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sender.apiKey}`,
      },
      body: JSON.stringify({
        from: sender.from,
        to: [to],
        subject,
        html,
      }),
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string }
      console.error("Resend API error:", errorData)
      return false
    }

    return true
  } catch (error) {
    console.error("Failed to send system email:", error)
    return false
  }
}