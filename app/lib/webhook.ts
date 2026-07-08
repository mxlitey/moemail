import { WEBHOOK_CONFIG } from "../config"

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

// HTML 实体解码
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

// 最小化 HTML → Markdown 转换器，覆盖邮件常见标签，无 DOM 依赖，Worker/Edge 均可运行
export function htmlToMarkdown(html: string): string {
  if (!html) return ""
  let s = html

  // 移除 script/style 及其内容
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "")
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "")

  // 标题 h1~h6 → 对应 # 数量
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, inner: string) => {
    return `\n${"#".repeat(Number(lvl))} ${stripTags(inner).trim()}\n`
  })

  // 加粗
  s = s.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => `**${stripTags(inner).trim()}**`)
  // 斜体
  s = s.replace(/<(i|em)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => `*${stripTags(inner).trim()}*`)
  // 删除线
  s = s.replace(/<(s|del|strike)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => `~~${stripTags(inner).trim()}~~`)

  // 链接 <a href="url">text</a>
  s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const text = stripTags(inner).trim() || href
    return `[${text}](${href})`
  })

  // 图片 <img src="url" alt="text">
  s = s.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, (m, src: string) => {
    const altMatch = m.match(/alt=["']([^"']*)["']/i)
    return `![${altMatch ? altMatch[1] : ""}](${src})`
  })

  // 换行
  s = s.replace(/<br\s*\/?>/gi, "\n")

  // 列表：无序
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner: string) => {
    return "\n" + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_lm: string, li: string) => `- ${stripTags(li).trim()}\n`)
  })
  // 列表：有序
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    let idx = 1
    return "\n" + inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_lm: string, li: string) => `${idx++}. ${stripTags(li).trim()}\n`)
  })

  // 引用
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner: string) => {
    return "\n" + stripTags(inner).split("\n").map((l: string) => `> ${l}`).join("\n") + "\n"
  })

  // 分隔线
  s = s.replace(/<hr\s*\/?>/gi, "\n---\n")

  // 段落 / div → 换行
  s = s.replace(/<\/(p|div)>/gi, "\n\n")
  s = s.replace(/<(p|div)[^>]*>/gi, "")

  // 剥离其余所有标签
  s = stripTags(s)

  // 实体解码
  s = decodeHtmlEntities(s)

  // 压缩多余空行（超过 2 个换行压缩为 2 个）
  s = s.replace(/\n{3,}/g, "\n\n").trim()

  return s
}

// 剥离所有 HTML 标签，仅保留纯文本
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "")
}

// 剥离 Markdown 标记符号，用于不支持 md 的纯文本场景（如飞书 text 模式）
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")        // 标题
    .replace(/\*\*(.+?)\*\*/g, "$1")    // 加粗
    .replace(/\*(.+?)\*/g, "$1")        // 斜体
    .replace(/~~(.+?)~~/g, "$1")        // 删除线
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1") // 链接保留文本
    .replace(/!\[(.*?)\]\((.+?)\)/g, "$1") // 图片保留 alt
    .replace(/^>\s+/gm, "")             // 引用
    .replace(/^[-*]\s+/gm, "")          // 无序列表
    .replace(/^\d+\.\s+/gm, "")         // 有序列表
    .replace(/^---$/gm, "")             // 分隔线
    .trim()
}

// 根据平台构造请求体（纯函数，前端文档区与后端发送共用同一份逻辑）
export function buildBody(platform: Platform, data: EmailMessage, url?: string): string {
  // 优先用 html 转换的 markdown（保留格式），html 为空时回退纯文本 content
  const bodyMarkdown = data.html ? htmlToMarkdown(data.html) : data.content

  // 各平台统一展示 EmailMessage 的全部 8 个字段，与通用 JSON 格式信息对齐
  const text = [
    `📧 ${data.subject}`,
    `发件人：${data.fromAddress}`,
    `收件人：${data.toAddress}`,
    `时间：${data.receivedAt}`,
    `邮件ID：${data.emailId}`,
    `消息ID：${data.messageId}`,
    `内容：${data.content}`,
    `HTML：${data.html}`,
    "",
    stripMarkdown(bodyMarkdown),
  ].join("\n")

  const markdown = [
    `### 📧 ${data.subject}`,
    "",
    `**发件人**：${data.fromAddress}`,
    `**收件人**：${data.toAddress}`,
    `**时间**：${data.receivedAt}`,
    `**邮件ID**：${data.emailId}`,
    `**消息ID**：${data.messageId}`,
    `**内容**：${data.content}`,
    `**HTML**：${data.html}`,
    "",
    bodyMarkdown,
  ].join("\n")

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
        content: [
          `**📧 ${data.subject}**`,
          `发件人：${data.fromAddress}`,
          `收件人：${data.toAddress}`,
          `时间：${data.receivedAt}`,
          `邮件ID：${data.emailId}`,
          `消息ID：${data.messageId}`,
          `内容：${data.content}`,
          `HTML：${data.html}`,
          "",
          bodyMarkdown,
        ].join("\n"),
      })
    case "slack":
      return JSON.stringify({
        text: `📧 ${data.subject}`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `📧 ${data.subject}` },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*发件人*\n${data.fromAddress}` },
              { type: "mrkdwn", text: `*收件人*\n${data.toAddress}` },
              { type: "mrkdwn", text: `*时间*\n${data.receivedAt}` },
              { type: "mrkdwn", text: `*邮件ID*\n${data.emailId}` },
              { type: "mrkdwn", text: `*消息ID*\n${data.messageId}` },
              { type: "mrkdwn", text: `*内容*\n${data.content}` },
              { type: "mrkdwn", text: `*HTML*\n${data.html}` },
            ],
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: bodyMarkdown },
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
      // 通用 JSON：保留原始邮件数据结构（全部字段）
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
