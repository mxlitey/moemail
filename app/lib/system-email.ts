/**
 * 系统邮件的发送辅助（与用户发件链路相互独立）。
 *
 * 发件地址遵循站点约定：取第一个已配置的域名，固定使用 noreply@{domain} 作为发件人。
 * 仅当管理员启用了发件服务且至少配置了一个域名时才可用。
 */

const RESEND_API_KEYS_KEY = "RESEND_API_KEYS"

export type SystemSender = {
  from: string
  apiKey: string
}

/**
 * 解析系统发件配置。未启用发件服务或未配置域名时返回 null。
 */
export async function getSystemSender(siteConfig: KVNamespace): Promise<SystemSender | null> {
  const enabled = await siteConfig.get("EMAIL_SERVICE_ENABLED")
  if (enabled !== "true") return null

  const raw = await siteConfig.get(RESEND_API_KEYS_KEY)
  if (!raw) return null

  try {
    const map = JSON.parse(raw) as Record<string, string>
    const first = Object.entries(map).find(([domain, apiKey]) => domain && apiKey)
    if (!first) return null

    const [domain, apiKey] = first
    return { from: `noreply@${domain}`, apiKey }
  } catch (error) {
    console.error("Failed to parse resend domain keys:", error)
    return null
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
    console.error("System email skipped: email service not configured")
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