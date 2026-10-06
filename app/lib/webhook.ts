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

export type WebhookEvent = typeof WEBHOOK_CONFIG.EVENTS[keyof typeof WEBHOOK_CONFIG.EVENTS]

export interface WebhookPayload {
  event: WebhookEvent
  data: EmailMessage
}

// 用户自定义请求头的键值对
export interface WebhookHeader {
  key: string
  value: string
}

// 全部可用占位符；说明文案由前端 i18n 提供
export const WEBHOOK_PLACEHOLDERS = [
  "event",
  "subject",
  "fromAddress",
  "toAddress",
  "receivedAt",
  "content",
  "html",
  "emailId",
  "messageId",
  "markdown",
] as const

export type WebhookPlaceholder = typeof WEBHOOK_PLACEHOLDERS[number]

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

// 剥离所有 HTML 标签，仅保留纯文本
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "")
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

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g

// 占位符取值：邮件字段 + 事件名 + markdown 派生值
function buildPlaceholderValues(payload: WebhookPayload): Record<string, string> {
  const { data, event } = payload
  const markdown = data.html ? htmlToMarkdown(data.html) : (data.content || "")
  return {
    event,
    subject: data.subject || "",
    fromAddress: data.fromAddress || "",
    toAddress: data.toAddress || "",
    receivedAt: data.receivedAt || "",
    content: data.content || "",
    html: data.html || "",
    emailId: data.emailId || "",
    messageId: data.messageId || "",
    markdown,
  }
}

// 转义为可安全放进 JSON 字符串的内容（去掉 JSON.stringify 自带的首尾引号）
function jsonEscape(value: string): string {
  return JSON.stringify(value).slice(1, -1)
}

/**
 * 渲染模板。
 * - mode = "json"：占位符值做 JSON 字符串转义，可安全嵌入 JSON 请求体
 * - mode = "raw"：原样替换，用于请求头
 * 未识别的占位符原样保留，便于用户发现拼写错误。
 */
export function renderTemplate(
  template: string,
  payload: WebhookPayload,
  mode: "json" | "raw" = "json"
): string {
  const values = buildPlaceholderValues(payload)
  const encode = mode === "json" ? jsonEscape : (v: string) => v
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? encode(values[key]) : match
  )
}

// 未配置模板时的兜底：直接发送邮件的通用数据 JSON
export function buildDefaultBody(data: EmailMessage): string {
  return JSON.stringify(data)
}

// 把 JSON 字符串字面量内部的真实换行/制表符转义为 \n / \t，
// 让用户可以在模板里直接换行书写（保持可读），字符串外的换行（结构缩进）保持不变。
function escapeNewlinesInJsonStrings(input: string): string {
  let result = ""
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (!inString) {
      if (ch === '"') inString = true
      result += ch
      continue
    }

    if (escaped) {
      result += ch
      escaped = false
      continue
    }

    if (ch === "\\") {
      result += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      result += ch
      inString = false
      continue
    }

    if (ch === "\r") {
      result += "\\n"
      if (input[i + 1] === "\n") i++
      continue
    }

    if (ch === "\n") {
      result += "\\n"
      continue
    }

    if (ch === "\t") {
      result += "\\t"
      continue
    }

    if (ch < " ") {
      result += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`
      continue
    }

    result += ch
  }

  return result
}

// 去掉多行文本中续行的公共缩进（首行不动，纯空白行不参与计算）
function dedentMultiline(content: string): string {
  const lines = content.split("\n")
  if (lines.length < 2) return content

  let minIndent = Infinity
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === "") continue
    const indent = line.length - line.replace(/^[ \t]+/, "").length
    if (indent < minIndent) minIndent = indent
  }

  if (!Number.isFinite(minIndent) || minIndent === 0) return content

  const stripPattern = new RegExp(`^[ \\t]{0,${minIndent}}`)
  for (let i = 1; i < lines.length; i++) {
    lines[i] = lines[i].replace(stripPattern, "")
  }
  return lines.join("\n")
}

// 对 JSON 字符串字面量内部的多行文本去掉公共缩进（仅处理真实换行）
function dedentJsonStringBlocks(input: string): string {
  let result = ""
  let content = ""
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (!inString) {
      if (ch === '"') {
        inString = true
        content = ""
      }
      result += ch
      continue
    }

    if (escaped) {
      content += ch
      escaped = false
      continue
    }

    if (ch === "\\") {
      content += ch
      escaped = true
      continue
    }

    if (ch === '"') {
      result += dedentMultiline(content) + ch
      inString = false
      continue
    }

    content += ch
  }

  // 字符串未闭合（非法 JSON）时原样输出剩余内容
  if (inString) result += content

  return result
}

// 宽松 JSON：当请求体形似 JSON 但因字符串内的真实换行而非法时，
// 去掉多行字符串的公共缩进并转义换行后再校验
function normalizeJsonBody(body: string): string {
  const trimmed = body.trimStart()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return body

  try {
    JSON.parse(body)
    return body
  } catch {
    const fixed = escapeNewlinesInJsonStrings(dedentJsonStringBlocks(body))
    try {
      JSON.parse(fixed)
      return fixed
    } catch {
      return body
    }
  }
}

// 构造请求体：模板优先，空模板回退通用数据 JSON
export function buildRequestBody(payload: WebhookPayload, template?: string | null): string {
  if (template && template.trim()) {
    return normalizeJsonBody(renderTemplate(template, payload, "json"))
  }
  return buildDefaultBody(payload.data)
}

// RFC 7230 token 形式的 Header 名
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

// 运行时受控或规范禁用、用户无法真正设置的头
const FORBIDDEN_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "upgrade",
  "expect",
  "keep-alive",
  "te",
  "trailer",
  "date",
  "dnt",
  "via",
  "cookie",
  "cookie2",
  "referer",
  "origin",
  "accept",
  "accept-language",
  "accept-encoding",
  "user-agent",
])

export function isValidHeaderName(key: string): boolean {
  return HEADER_NAME_PATTERN.test(key.trim())
}

export function isForbiddenHeader(key: string): boolean {
  const k = key.trim().toLowerCase()
  if (!k) return true
  if (FORBIDDEN_HEADERS.has(k)) return true
  if (k.startsWith("proxy-") || k.startsWith("sec-")) return true
  return false
}

// 默认头：用户可自定义覆盖或删除
export function buildDefaultHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" }
}

/**
 * 合并最终请求头：
 * - headers 为 null/undefined（历史配置从未配置过请求头）→ 使用默认头
 * - headers 为空数组 → 用户已显式删除全部请求头，不再注入默认头
 * - 其余情况 → 只使用用户自定义头（过滤非法/禁用头）
 * 传入 payload 时，头值中的占位符按原样替换（请求头不是 JSON，不做 JSON 转义）。
 */
export function buildHeaders(
  headers?: WebhookHeader[] | null,
  payload?: WebhookPayload
): Record<string, string> {
  if (headers == null) return buildDefaultHeaders()

  const result: Record<string, string> = {}
  for (const header of headers) {
    if (!header) continue
    const key = (header.key ?? "").trim()
    if (!key || !isValidHeaderName(key) || isForbiddenHeader(key)) continue
    const rawValue = payload
      ? renderTemplate(header.value ?? "", payload, "raw")
      : (header.value ?? "")
    // 头值不允许出现 CR/LF，避免头注入
    result[key] = rawValue.replace(/[\r\n]+/g, " ")
  }
  return result
}

// 解析数据库中存储的 headers JSON
export function parseHeaders(raw?: string | null): WebhookHeader[] | null {
  if (raw == null || raw === "") return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter((h) => h && typeof h.key === "string" && typeof h.value === "string")
      .map((h) => ({ key: h.key, value: h.value }))
  } catch {
    return null
  }
}

// 序列化自定义请求头供入库；null 表示"未配置"，[] 表示"显式清空"
export function serializeHeaders(headers?: WebhookHeader[] | null): string | null {
  if (headers == null) return null
  return JSON.stringify(headers)
}

// 示例邮件数据，前端预览与测试接口共用，保证展示内容与实际发送一致
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

export interface CallWebhookOptions {
  template?: string | null
  headers?: WebhookHeader[] | null
}

export async function callWebhook(
  url: string,
  payload: WebhookPayload,
  options: CallWebhookOptions = {}
) {
  const body = buildRequestBody(payload, options.template)
  const headers = buildHeaders(options.headers, payload)

  let lastError: Error | null = null

  for (let i = 0; i < WEBHOOK_CONFIG.MAX_RETRIES; i++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_CONFIG.TIMEOUT)

      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // 只认 HTTP 2xx 为成功
      if (response.ok) {
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