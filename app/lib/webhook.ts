import { WEBHOOK_CONFIG } from "@/config"

export interface EmailMessage {
  emailId: string
  messageId: string
  fromAddress: string
  subject: string
  content: string
  html: string
  receivedAt: string
  toAddress: string
}

export interface WebhookPayload {
  event: typeof WEBHOOK_CONFIG.EVENTS[keyof typeof WEBHOOK_CONFIG.EVENTS]
  data: EmailMessage
}

// 支持的平台类型
export type Platform =
  | "feishu"
  | "dingtalk"
  | "wechat"
  | "discord"
  | "slack"
  | "telegram"
  | "generic"

// 通过 URL 自动识别平台
export function detectPlatform(url: string): Platform {
  if (/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\//.test(url)) return "feishu"
  if (/oapi\.dingtalk\.com\/robot\/send/.test(url)) return "dingtalk"
  if (/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send/.test(url)) return "wechat"
  if (/discord\.com\/api\/webhooks\//.test(url)) return "discord"
  if (/hooks\.slack\.com\/services\//.test(url)) return "slack"
  if (/api\.telegram\.org\/bot.*\/sendMessage/.test(url)) return "telegram"
  return "generic"
}

// 从 URL 提取 Telegram chat_id（Telegram 把 chat_id 放在 query 参数里）
function extractTelegramChatId(url: string): string | null {
  try {
    const u = new URL(url)
    return u.searchParams.get("chat_id")
  } catch {
    return null
  }
}

// 根据平台构造请求体（纯函数，前端文档区与后端发送共用同一份逻辑）
export function buildBody(platform: Platform, data: EmailMessage, url?: string): string {
  const text = `📧 ${data.subject}\n发件人：${data.fromAddress}\n\n${data.content}`
  const markdown = `### 📧 ${data.subject}\n\n**发件人**：${data.fromAddress}\n\n${data.content}`

  switch (platform) {
    case "feishu":
      return JSON.stringify({
        msg_type: "text",
        content: { text },
      })
    case "dingtalk":
      return JSON.stringify({
        msgtype: "markdown",
        markdown: { title: data.subject, text: markdown },
      })
    case "wechat":
      return JSON.stringify({
        msgtype: "markdown",
        markdown: { content: markdown },
      })
    case "discord":
      return JSON.stringify({
        content: `**📧 ${data.subject}**\n发件人：${data.fromAddress}\n\n${data.content}`,
      })
    case "slack":
      return JSON.stringify({
        text: `📧 ${data.subject}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*发件人*：${data.fromAddress}\n${data.content}`,
            },
          },
        ],
      })
    case "telegram": {
      const chatId = url ? extractTelegramChatId(url) : null
      return JSON.stringify({
        chat_id: chatId,
        text: markdown,
        parse_mode: "Markdown",
      })
    }
    default:
      // 通用 JSON：保留原始邮件数据结构
      return JSON.stringify(data)
  }
}

// 飞书/钉钉/企业微信 虽然返回 HTTP 200，但 body 中 code/errcode 非 0 仍代表失败，需额外校验
function isPlatformSuccess(platform: Platform, resBody: any): boolean {
  if (platform === "feishu" || platform === "wechat") {
    return resBody?.code === 0 || resBody?.errcode === 0
  }
  if (platform === "dingtalk") {
    return resBody?.errcode === 0
  }
  return true
}

// 示例邮件数据，前端文档区与测试接口共用，保证展示内容与实际发送一致
export const SAMPLE_MESSAGE: EmailMessage = {
  emailId: "123456789",
  messageId: "987654321",
  fromAddress: "sender@example.com",
  subject: "Test Email",
  content: "This is a test email.",
  html: "<p>This is a <strong>test</strong> email.</p>",
  receivedAt: "2024-01-01T12:00:00.000Z",
  toAddress: "recipient@example.com",
}

export async function callWebhook(url: string, payload: WebhookPayload) {
  const platform = detectPlatform(url)
  const body = buildBody(platform, payload.data, url)

  let lastError: Error | null = null

  for (let i = 0; i < WEBHOOK_CONFIG.MAX_RETRIES; i++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_CONFIG.TIMEOUT)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Telegram 不需要 X-Webhook-Event 头
          ...(platform === "telegram" ? {} : { "X-Webhook-Event": payload.event }),
        },
        body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        // 部分平台 HTTP 200 但业务码非 0，需解析 body 校验
        if (platform === "feishu" || platform === "dingtalk" || platform === "wechat") {
          const resBody = await response.json().catch(() => ({}))
          if (!isPlatformSuccess(platform, resBody)) {
            throw new Error(`${platform} error: ${JSON.stringify(resBody)}`)
          }
        }
        return true
      }

      lastError = new Error(`HTTP error! status: ${response.status}`)
    } catch (error) {
      lastError = error as Error

      if (i < WEBHOOK_CONFIG.MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, WEBHOOK_CONFIG.RETRY_DELAY))
      }
    }
  }

  throw lastError
}
