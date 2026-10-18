import { getRequestContext } from "@cloudflare/next-on-pages"
import { and, eq, gt, isNull, like, ne, or, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { EMAIL_CONFIG } from "@/config"
import { EXPIRY_OPTIONS } from "@/types/email"
import { createDb } from "./db"
import { emails, messages, userRoles } from "./schema"
import { hasPermission, PERMISSIONS, ROLES, type Role } from "./permissions"
import { checkSendPermission } from "./send-permissions"
import { isSystemInbox } from "./system-inbox"

/** MCP 协议版本：优先回显客户端版本，不支持时使用服务端默认版本 */
const DEFAULT_PROTOCOL_VERSION = "2025-06-18"

export const MCP_SERVER_INFO = {
  name: "moemail",
  version: "1.0.0",
} as const

const MCP_INSTRUCTIONS = [
  "MoeMail 云端临时邮箱服务。",
  "可用工具：创建/列出/删除临时邮箱，读取邮件，等待新邮件，使用临时邮箱发件，读取站点配置。",
  "传入的 email 参数可以是邮箱地址（如 abc@example.com），也可以是邮箱 ID。",
].join("\n")

const EXPIRY_ALIASES: Record<string, number> = {
  "1h": 1000 * 60 * 60,
  "24h": 1000 * 60 * 60 * 24,
  "1d": 1000 * 60 * 60 * 24,
  "3d": 1000 * 60 * 60 * 24 * 3,
  "7d": 1000 * 60 * 60 * 24 * 7,
  permanent: 0,
  forever: 0,
}

export class McpToolError extends Error {}

export interface McpUserContext {
  userId: string
  roles: Role[]
}

interface TextContent {
  type: "text"
  text: string
}

export interface McpToolResult {
  content: TextContent[]
  isError?: boolean
  [key: string]: unknown
}

interface McpToolDefinition {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (ctx: McpUserContext, args: Record<string, unknown>) => Promise<McpToolResult>
}

function ok(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  }
}

function fail(message: string): McpToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  }
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== "string" || !value.trim()) {
    throw new McpToolError(`缺少必填参数：${key}`)
  }
  return value.trim()
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadUserContext(userId: string): Promise<McpUserContext> {
  const db = createDb()
  const rows = await db.query.userRoles.findMany({
    where: eq(userRoles.userId, userId),
    with: { role: true },
  })
  return {
    userId,
    roles: rows.map((row) => row.role.name as Role),
  }
}

export async function resolveMcpUser(userId: string): Promise<McpUserContext> {
  return loadUserContext(userId)
}

function ensureEmailAccess(ctx: McpUserContext) {
  const allowed = ctx.roles.some((role) => hasPermission([role], PERMISSIONS.MANAGE_EMAIL))
  if (!allowed) {
    throw new McpToolError("当前 API Key 所属用户没有邮箱使用权限")
  }
}

function isEmperor(ctx: McpUserContext) {
  return ctx.roles.includes(ROLES.EMPEROR)
}

type EmailRow = typeof emails.$inferSelect
type MessageRow = typeof messages.$inferSelect

async function resolveEmail(ctx: McpUserContext, args: Record<string, unknown>): Promise<EmailRow> {
  const db = createDb()
  const emailId = optionalString(args, "email_id")
  const address = optionalString(args, "address") ?? optionalString(args, "email")

  if (!emailId && !address) {
    throw new McpToolError("请提供 email_id 或 address（邮箱地址）")
  }

  const email = emailId
    ? await db.query.emails.findFirst({
        where: and(eq(emails.id, emailId), eq(emails.userId, ctx.userId)),
      })
    : await db.query.emails.findFirst({
        where: and(
          eq(sql`LOWER(${emails.address})`, address!.toLowerCase()),
          eq(emails.userId, ctx.userId)
        ),
      })

  if (!email) {
    throw new McpToolError("邮箱不存在或不属于当前 API Key 的用户")
  }

  return email
}

function formatEmail(email: EmailRow) {
  return {
    id: email.id,
    address: email.address,
    created_at: email.createdAt.toISOString(),
    expires_at: email.expiresAt.toISOString(),
  }
}

function formatMessage(message: MessageRow) {
  return {
    id: message.id,
    email_id: message.emailId,
    type: message.type ?? "received",
    from: message.fromAddress ?? "",
    to: message.toAddress ?? "",
    subject: message.subject,
    preview: (message.content ?? "").slice(0, 200),
    received_at: message.receivedAt.toISOString(),
    sent_at: message.sentAt?.toISOString() ?? message.receivedAt.toISOString(),
  }
}

async function resolveExpiry(args: Record<string, unknown>): Promise<number> {
  const raw = args.expiry ?? args.expiry_time ?? args.expiryTime
  if (raw === undefined || raw === null || raw === "") return EXPIRY_OPTIONS[1].value

  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (EXPIRY_OPTIONS.some((option) => option.value === raw)) return raw
    throw new McpToolError("expiry 仅支持 3600000 / 86400000 / 259200000 / 0")
  }

  if (typeof raw === "string") {
    const key = raw.trim().toLowerCase()
    if (key in EXPIRY_ALIASES) return EXPIRY_ALIASES[key]
    if (Number.isFinite(Number(key)) && EXPIRY_OPTIONS.some((option) => option.value === Number(key))) {
      return Number(key)
    }
  }

  throw new McpToolError("expiry 仅支持 1h / 24h / 3d / 7d / permanent")
}

async function getSiteConfig() {
  const env = getRequestContext().env
  const siteConfig = env?.SITE_CONFIG
  if (!siteConfig) {
    return {
      emailDomains: ["moemail.app"],
      maxEmails: EMAIL_CONFIG.MAX_ACTIVE_EMAILS,
      sendEnabled: false,
      adminContact: "",
      defaultRole: ROLES.CIVILIAN,
    }
  }

  const [domainsRaw, maxEmailsRaw, sendEnabledRaw, adminContact, defaultRole] = await Promise.all([
    siteConfig.get("EMAIL_DOMAINS"),
    siteConfig.get("MAX_EMAILS"),
    siteConfig.get("EMAIL_SERVICE_ENABLED"),
    siteConfig.get("ADMIN_CONTACT"),
    siteConfig.get("DEFAULT_ROLE"),
  ])

  return {
    emailDomains: (domainsRaw || "moemail.app")
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean),
    maxEmails: Number(maxEmailsRaw) || EMAIL_CONFIG.MAX_ACTIVE_EMAILS,
    sendEnabled: sendEnabledRaw === "true",
    adminContact: adminContact || "",
    defaultRole: defaultRole || ROLES.CIVILIAN,
  }
}

const tools: McpToolDefinition[] = [
  {
    name: "get_config",
    title: "获取站点配置",
    description:
      "读取当前 MoeMail 站点配置：可用邮箱域名、单用户邮箱上限、发件服务是否启用、管理员联系方式。不会修改任何配置。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    async handler() {
      const config = await getSiteConfig()
      return ok(config)
    },
  },
  {
    name: "create_email",
    title: "创建临时邮箱",
    description:
      "创建一个临时邮箱地址。expiry 支持 1h / 24h / 3d / 7d / permanent（默认 24h）。domain 不传时使用站点第一个可用域名。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "邮箱前缀，可选；不传则随机生成" },
        domain: { type: "string", description: "邮箱域名，可通过 get_config 获取" },
        expiry: {
          type: "string",
          description: "有效期：1h / 24h / 3d / 7d / permanent，默认 24h",
        },
      },
      additionalProperties: false,
    },
    async handler(ctx, args) {
      ensureEmailAccess(ctx)
      const config = await getSiteConfig()
      const db = createDb()

      const domainArg = optionalString(args, "domain")
      const domain = domainArg ?? config.emailDomains[0]
      if (!domain || !config.emailDomains.some((item) => item.toLowerCase() === domain.toLowerCase())) {
        throw new McpToolError(`无效的域名，可用域名：${config.emailDomains.join(", ")}`)
      }

      const nameArg = optionalString(args, "name")
      let name = nameArg ?? nanoid(8)
      if (nameArg) {
        if (!/^[a-zA-Z0-9._-]{1,64}$/.test(nameArg)) {
          throw new McpToolError("邮箱前缀只能包含字母、数字、点、下划线和横杠，长度不超过 64")
        }
        name = nameArg
      }

      if (!isEmperor(ctx)) {
        const active = await db
          .select({ count: sql<number>`count(*)` })
          .from(emails)
          .where(
            and(
              eq(emails.userId, ctx.userId),
              gt(emails.expiresAt, new Date()),
              like(emails.address, "%@%")
            )
          )

        if (Number(active[0].count) >= config.maxEmails) {
          throw new McpToolError(`已达到最大邮箱数量限制（${config.maxEmails}）`)
        }
      }

      const address = `${name}@${domain}`
      const existing = await db.query.emails.findFirst({
        where: eq(sql`LOWER(${emails.address})`, address.toLowerCase()),
      })
      if (existing) {
        throw new McpToolError(`邮箱地址已被使用：${address}`)
      }

      const expiry = await resolveExpiry(args)
      const now = new Date()
      const expiresAt =
        expiry === 0 ? new Date("9999-01-01T00:00:00.000Z") : new Date(now.getTime() + expiry)

      const [created] = await db
        .insert(emails)
        .values({ address, createdAt: now, expiresAt, userId: ctx.userId })
        .returning()

      return ok(formatEmail(created))
    },
  },
  {
    name: "list_emails",
    title: "列出临时邮箱",
    description: "列出当前 API Key 用户名下的所有有效临时邮箱（不含系统通知收件箱）。",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "返回数量上限，默认 20，最大 100" },
      },
      additionalProperties: false,
    },
    async handler(ctx, args) {
      ensureEmailAccess(ctx)
      const db = createDb()
      const limit = clamp(optionalNumber(args, "limit") ?? 20, 1, 100)

      const rows = await db.query.emails.findMany({
        where: and(
          eq(emails.userId, ctx.userId),
          gt(emails.expiresAt, new Date()),
          like(emails.address, "%@%")
        ),
        orderBy: (table, { desc: descOrder }) => [descOrder(table.createdAt), descOrder(table.id)],
        limit,
      })

      return ok({ emails: rows.map(formatEmail), total: rows.length })
    },
  },
  {
    name: "list_messages",
    title: "列出邮件",
    description:
      "列出指定邮箱中的邮件。type 可选 received（默认）/ sent / all。邮件按时间倒序返回。",
    inputSchema: {
      type: "object",
      properties: {
        email_id: { type: "string", description: "邮箱 ID（与 address 二选一）" },
        address: { type: "string", description: "邮箱地址，如 abc@example.com（与 email_id 二选一）" },
        type: { type: "string", enum: ["received", "sent", "all"], description: "邮件类型，默认 received" },
        limit: { type: "number", description: "返回数量上限，默认 20，最大 100" },
      },
      additionalProperties: false,
    },
    async handler(ctx, args) {
      ensureEmailAccess(ctx)
      const email = await resolveEmail(ctx, args)
      const db = createDb()
      const limit = clamp(optionalNumber(args, "limit") ?? 20, 1, 100)
      const type = optionalString(args, "type") ?? "received"

      const conditions = [eq(messages.emailId, email.id)]
      if (type === "received") {
        conditions.push(or(ne(messages.type, "sent"), isNull(messages.type))!)
      } else if (type === "sent") {
        conditions.push(eq(messages.type, "sent"))
      }

      const rows = await db.query.messages.findMany({
        where: and(...conditions),
        orderBy: (table, { desc: descOrder }) => [descOrder(table.receivedAt), descOrder(table.id)],
        limit,
      })

      return ok({
        address: email.address,
        messages: rows.map(formatMessage),
        total: rows.length,
      })
    },
  },
  {
    name: "read_message",
    title: "读取邮件内容",
    description: "读取单封邮件的完整纯文本与 HTML 内容。",
    inputSchema: {
      type: "object",
      properties: {
        email_id: { type: "string", description: "邮箱 ID（与 address 二选一）" },
        address: { type: "string", description: "邮箱地址（与 email_id 二选一）" },
        message_id: { type: "string", description: "邮件 ID" },
      },
      required: ["message_id"],
      additionalProperties: false,
    },
    async handler(ctx, args) {
      ensureEmailAccess(ctx)
      const email = await resolveEmail(ctx, args)
      const messageId = requireString(args, "message_id")
      const db = createDb()

      const message = await db.query.messages.findFirst({
        where: and(eq(messages.id, messageId), eq(messages.emailId, email.id)),
      })
      if (!message) {
        throw new McpToolError("邮件不存在")
      }

      return ok({
        ...formatMessage(message),
        content: message.content ?? "",
        html: message.html ?? "",
      })
    },
  },
  {
    name: "wait_for_email",
    title: "等待新邮件",
    description:
      "轮询等待指定邮箱收到新邮件。默认最多等待 20 秒，返回 status=timeout 时可在同一邮箱上再次调用。",
    inputSchema: {
      type: "object",
      properties: {
        email_id: { type: "string", description: "邮箱 ID（与 address 二选一）" },
        address: { type: "string", description: "邮箱地址（与 email_id 二选一）" },
        timeout_seconds: { type: "number", description: "最长等待秒数，默认 20，最大 25" },
        since: { type: "string", description: "起始时间（ISO 字符串），默认从现在开始" },
      },
      additionalProperties: false,
    },
    async handler(ctx, args) {
      ensureEmailAccess(ctx)
      const email = await resolveEmail(ctx, args)
      const db = createDb()
      const timeoutSeconds = clamp(optionalNumber(args, "timeout_seconds") ?? 20, 1, 25)
      const sinceRaw = optionalString(args, "since")
      const since = sinceRaw ? new Date(sinceRaw) : new Date()
      if (Number.isNaN(since.getTime())) {
        throw new McpToolError("since 不是合法的时间字符串")
      }

      const deadline = Date.now() + timeoutSeconds * 1000
      const pollInterval = 3000

      while (true) {
        const message = await db.query.messages.findFirst({
          where: and(
            eq(messages.emailId, email.id),
            ne(messages.type, "sent"),
            gt(messages.receivedAt, since)
          ),
          orderBy: (table, { desc: descOrder }) => [descOrder(table.receivedAt), descOrder(table.id)],
        })

        if (message) {
          return ok({
            status: "received",
            address: email.address,
            message: formatMessage(message),
            next_since: new Date(message.receivedAt.getTime() + 1).toISOString(),
          })
        }

        if (Date.now() + pollInterval > deadline) {
          return ok({
            status: "timeout",
            address: email.address,
            hint: "在 timeout_seconds 内没有新邮件，可再次调用 wait_for_email 继续等待",
            next_since: new Date().toISOString(),
          })
        }

        await sleep(pollInterval)
      }
    },
  },
  {
    name: "send_email",
    title: "发送邮件",
    description:
      "使用临时邮箱发送邮件。content 作为 HTML 正文提交。需要站点已启用发件服务且用户有发件额度。",
    inputSchema: {
      type: "object",
      properties: {
        email_id: { type: "string", description: "发件邮箱 ID（与 address 二选一）" },
        address: { type: "string", description: "发件邮箱地址（与 email_id 二选一）" },
        to: { type: "string", description: "收件人邮箱地址" },
        subject: { type: "string", description: "邮件主题" },
        content: { type: "string", description: "邮件正文（HTML）" },
      },
      required: ["to", "subject", "content"],
      additionalProperties: false,
    },
    async handler(ctx, args) {
      ensureEmailAccess(ctx)
      const email = await resolveEmail(ctx, args)
      const to = requireString(args, "to")
      const subject = requireString(args, "subject")
      const content = requireString(args, "content")

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        throw new McpToolError("收件人邮箱格式不正确")
      }

      const permission = await checkSendPermission(ctx.userId)
      if (!permission.canSend) {
        throw new McpToolError(permission.error || "没有发件权限")
      }

      const domain = email.address.split("@").pop()?.trim().toLowerCase() || ""
      const siteConfig = getRequestContext().env?.SITE_CONFIG
      const domainKeysRaw = siteConfig ? await siteConfig.get("RESEND_API_KEYS") : null

      let domainKeys: Record<string, string> = {}
      try {
        domainKeys = domainKeysRaw ? (JSON.parse(domainKeysRaw) as Record<string, string>) : {}
      } catch {
        domainKeys = {}
      }

      const apiKey = domainKeys[domain]
      if (!apiKey) {
        throw new McpToolError(`域名 ${domain} 未配置 Resend 发件服务，请联系管理员`)
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: email.address,
          to: [to],
          subject,
          html: content,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string }
        throw new McpToolError(errorData.message || "Resend 发送失败，请稍后重试")
      }

      const db = createDb()
      const [saved] = await db
        .insert(messages)
        .values({
          emailId: email.id,
          fromAddress: email.address,
          toAddress: to,
          subject,
          content: "",
          html: content,
          type: "sent",
        })
        .returning()

      return ok({
        success: true,
        message_id: saved.id,
        from: email.address,
        to,
        subject,
        remaining: permission.remainingEmails,
      })
    },
  },
  {
    name: "delete_message",
    title: "删除邮件",
    description: "删除指定邮箱中的单封邮件。",
    inputSchema: {
      type: "object",
      properties: {
        email_id: { type: "string", description: "邮箱 ID（与 address 二选一）" },
        address: { type: "string", description: "邮箱地址（与 email_id 二选一）" },
        message_id: { type: "string", description: "邮件 ID" },
      },
      required: ["message_id"],
      additionalProperties: false,
    },
    async handler(ctx, args) {
      ensureEmailAccess(ctx)
      const email = await resolveEmail(ctx, args)
      const messageId = requireString(args, "message_id")
      const db = createDb()

      const message = await db.query.messages.findFirst({
        where: and(eq(messages.id, messageId), eq(messages.emailId, email.id)),
      })
      if (!message) {
        throw new McpToolError("邮件不存在或已删除")
      }

      await db.delete(messages).where(eq(messages.id, messageId))
      return ok({ success: true, deleted_message_id: messageId })
    },
  },
  {
    name: "delete_email",
    title: "删除临时邮箱",
    description: "删除指定临时邮箱及其全部邮件。系统通知收件箱不可删除。",
    inputSchema: {
      type: "object",
      properties: {
        email_id: { type: "string", description: "邮箱 ID（与 address 二选一）" },
        address: { type: "string", description: "邮箱地址（与 email_id 二选一）" },
      },
      additionalProperties: false,
    },
    async handler(ctx, args) {
      ensureEmailAccess(ctx)
      const email = await resolveEmail(ctx, args)

      if (isSystemInbox(email.address)) {
        throw new McpToolError("通知中心不可删除")
      }

      const db = createDb()
      await db.delete(messages).where(eq(messages.emailId, email.id))
      await db.delete(emails).where(eq(emails.id, email.id))

      return ok({ success: true, deleted_email_id: email.id, address: email.address })
    },
  },
]

const toolMap = new Map(tools.map((tool) => [tool.name, tool]))

export function listTools() {
  return tools.map(({ name, title, description, inputSchema }) => ({
    name,
    title,
    description,
    inputSchema,
  }))
}

export function listToolNames() {
  return tools.map((tool) => tool.name)
}

export function negotiateProtocolVersion(requested: unknown): string {
  if (typeof requested === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    return requested
  }
  return DEFAULT_PROTOCOL_VERSION
}

interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

function rpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } }
}

async function dispatch(ctx: McpUserContext, request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null
  const method = request.method

  if (!method) {
    return rpcError(id, -32600, "Invalid Request")
  }

  // 通知类消息没有 id，不需要返回响应
  const isNotification = request.id === undefined

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiateProtocolVersion(request.params?.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: MCP_SERVER_INFO,
          instructions: MCP_INSTRUCTIONS,
        },
      }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} }
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: listTools() } }
    case "tools/call": {
      const name = request.params?.name
      const args = (request.params?.arguments ?? {}) as Record<string, unknown>

      if (typeof name !== "string") {
        return rpcError(id, -32602, "Missing tool name")
      }

      const tool = toolMap.get(name)
      if (!tool) {
        return rpcError(id, -32602, `Unknown tool: ${name}`)
      }

      try {
        const result = await tool.handler(ctx, args)
        return { jsonrpc: "2.0", id, result }
      } catch (error) {
        if (error instanceof McpToolError) {
          return { jsonrpc: "2.0", id, result: fail(error.message) }
        }
        console.error(`MCP tool ${name} failed:`, error)
        const message = error instanceof Error ? error.message : "工具执行失败"
        return { jsonrpc: "2.0", id, result: fail(message) }
      }
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return isNotification ? null : { jsonrpc: "2.0", id, result: {} }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`)
  }
}

/**
 * 处理一批 JSON-RPC 消息（兼容批量请求）。通知类消息不产生响应。
 */
export async function handleJsonRpc(
  ctx: McpUserContext,
  payload: JsonRpcRequest | JsonRpcRequest[]
): Promise<{ responses: JsonRpcResponse[]; hasOnlyNotifications: boolean }> {
  const requests = Array.isArray(payload) ? payload : [payload]
  const responses: JsonRpcResponse[] = []

  for (const request of requests) {
    const response = await dispatch(ctx, request)
    if (response) responses.push(response)
  }

  return {
    responses,
    hasOnlyNotifications: responses.length === 0,
  }
}
