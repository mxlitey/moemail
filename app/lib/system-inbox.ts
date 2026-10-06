import type { Db } from "./db"
import { emails, messages, users } from "./schema"
import { and, eq, gt, inArray, notLike } from "drizzle-orm"
import {
  WELCOME_SUBJECT_KEY,
  WELCOME_CONTENT_KEY,
  renderMessageTemplate,
  resolveWelcomeTemplate,
} from "../config"
import type { PlaceholderContext } from "../config"

/**
 * 系统收件箱地址不带 "@" 后缀。
 *
 * 用户创建的邮箱地址恒为 `{name}@{domain}`（见 api/emails/generate），因此哨兵地址：
 *  1. 与用户地址天然不冲突，无需再做保留前缀校验；
 *  2. 不可能被 email-receiver 的精确地址匹配命中（真实来信的 to 一定含 "@"）。
 */
const SYSTEM_INBOX_ADDRESS_PREFIX = "system:"

/** 永久有效，避开 cleanup worker 的过期删除 */
const SYSTEM_INBOX_EXPIRES_AT = new Date("9999-01-01T00:00:00.000Z")

/** D1 单条 SQL 的绑定参数上限为 100 */
const D1_MAX_BOUND_PARAMS = 100

/**
 * inArray 分块大小。查询里除 inArray 自身外还有其他绑定参数（如 notLike 的 pattern），
 * 因此不能取满 100，留出余量。
 */
const IN_ARRAY_CHUNK_SIZE = 50

/**
 * 每行占用的绑定参数数量。注意 `$defaultFn`（id / createdAt / receivedAt / sentAt）
 * 由 drizzle 在客户端取值后作为普通参数写入 SQL，同样计入上限，不能漏算。
 */
const EMAIL_INSERT_PARAMS_PER_ROW = 5 // id, address, userId, created_at, expires_at
const MESSAGE_INSERT_PARAMS_PER_ROW = 10 // id, emailId, from_address, to_address, subject, content, html, type, received_at, sent_at

const EMAIL_ROWS_PER_INSERT = Math.floor(D1_MAX_BOUND_PARAMS / EMAIL_INSERT_PARAMS_PER_ROW)
const MESSAGE_ROWS_PER_INSERT = Math.floor(D1_MAX_BOUND_PARAMS / MESSAGE_INSERT_PARAMS_PER_ROW)

/** 系统消息的 type 标记，收件箱列表的 received 过滤会自动命中 */
export const SYSTEM_MESSAGE_TYPE = "system"

/** 系统通知的默认显示名，同时充当分类标签 */
export const SYSTEM_NOTICE_FROM = "系统通知"

/** 管理员广播的显示名，与系统通知区分 */
export const SYSTEM_ANNOUNCEMENT_FROM = "系统公告"

export type SystemMessageInput = {
  subject: string
  content?: string
  html?: string
  /** 显示在详情页的"发件人"，也用作分类标签 */
  fromAddress?: string
  /** 传入后按 subject 去重：窗口内已存在同 subject 的消息则跳过 */
  dedupSince?: Date
}

export type EmailRow = typeof emails.$inferSelect

export function isSystemInbox(address: string | null | undefined): boolean {
  return !!address && !address.includes("@")
}

export function systemInboxAddress(userId: string): string {
  return `${SYSTEM_INBOX_ADDRESS_PREFIX}${userId}`
}

function toMessageValues(emailId: string, input: SystemMessageInput) {
  return {
    emailId,
    fromAddress: input.fromAddress ?? SYSTEM_NOTICE_FROM,
    toAddress: null,
    subject: input.subject,
    content: input.content ?? "",
    html: input.html ?? "",
    type: SYSTEM_MESSAGE_TYPE,
  }
}

/**
 * 确保用户拥有系统收件箱；首次创建时一并写入欢迎消息（仅创建时发生，幂等）。
 *
 * siteConfig 用于读取管理员自定义的欢迎文案，未传入时使用内置默认值
 * （Worker 环境没有 SITE_CONFIG 绑定，走默认值；该路径仅在用户从未登录过时才会创建收件箱）。
 *
 * 注意：批量场景请使用 ensureSystemInboxes，它不会补发欢迎消息。
 */
export async function ensureSystemInbox(
  db: Db,
  userId: string,
  siteConfig?: KVNamespace
): Promise<{ inbox: EmailRow; created: boolean }> {
  const rows = await db.query.emails.findMany({
    where: eq(emails.userId, userId),
  })

  const existing = rows.find((row) => isSystemInbox(row.address))
  if (existing) {
    return { inbox: existing, created: false }
  }

  let inbox: EmailRow
  try {
    inbox = await db
      .insert(emails)
      .values({
        address: systemInboxAddress(userId),
        userId,
        expiresAt: SYSTEM_INBOX_EXPIRES_AT,
      })
      .returning()
      .get()
  } catch (error) {
    // 并发创建触发唯一约束冲突时，重查返回
    const retry = await db.query.emails.findFirst({
      where: eq(emails.address, systemInboxAddress(userId)),
    })
    if (retry) {
      return { inbox: retry, created: false }
    }
    throw error
  }

  // 直接写入欢迎消息：此处不能再走 insertSystemMessage，否则会重复触发 ensureSystemInbox
  try {
    const [rawSubject, rawContent] = siteConfig
      ? await Promise.all([
          siteConfig.get(WELCOME_SUBJECT_KEY),
          siteConfig.get(WELCOME_CONTENT_KEY),
        ])
      : [null, null]

    const template = resolveWelcomeTemplate(rawSubject, rawContent)

    // 占位符上下文只在创建路径上查询，不影响已存在收件箱的热路径
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    const ctx: PlaceholderContext = {
      userId,
      username: user?.username,
      name: user?.name,
      email: user?.email,
    }

    await db.insert(messages).values(
      toMessageValues(inbox.id, {
        subject: renderMessageTemplate(template.subject, ctx),
        content: renderMessageTemplate(template.content, ctx),
      })
    )
  } catch (error) {
    console.error("Failed to insert welcome message:", error)
  }

  return { inbox, created: true }
}

/**
 * 向单个用户投递一条系统消息。
 * 通知属于副作用：内部吞掉异常并记录日志，避免影响调用方的主流程。
 */
export async function insertSystemMessage(
  db: Db,
  userId: string,
  input: SystemMessageInput
): Promise<string | null> {
  try {
    const { inbox } = await ensureSystemInbox(db, userId)

    if (input.dedupSince) {
      const duplicate = await db.query.messages.findFirst({
        where: and(
          eq(messages.emailId, inbox.id),
          eq(messages.subject, input.subject),
          gt(messages.receivedAt, input.dedupSince)
        ),
      })
      if (duplicate) return null
    }

    const inserted = await db
      .insert(messages)
      .values(toMessageValues(inbox.id, input))
      .returning({ id: messages.id })
      .get()

    return inserted.id
  } catch (error) {
    console.error("Failed to insert system message:", error)
    return null
  }
}

/**
 * 批量确保多个用户的系统收件箱存在，返回 userId -> emailId 映射。
 * 供广播、配额调整等 fan-out 场景使用，避免逐个查询。
 * 为控制写入量，这里补建的收件箱不会补发欢迎消息。
 */
export async function ensureSystemInboxes(
  db: Db,
  userIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (userIds.length === 0) return result

  const unique = Array.from(new Set(userIds))

  // 查询已存在的系统收件箱（inArray 同样受参数上限约束，需分块）
  for (let i = 0; i < unique.length; i += IN_ARRAY_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + IN_ARRAY_CHUNK_SIZE)
    const rows = await db.query.emails.findMany({
      where: and(inArray(emails.userId, chunk), notLike(emails.address, "%@%")),
    })
    for (const row of rows) {
      if (row.userId) result.set(row.userId, row.id)
    }
  }

  // 补建缺失的收件箱
  const missing = unique.filter((id) => !result.has(id))

  for (let i = 0; i < missing.length; i += EMAIL_ROWS_PER_INSERT) {
    const chunk = missing.slice(i, i + EMAIL_ROWS_PER_INSERT)

    await db
      .insert(emails)
      .values(
        chunk.map((userId) => ({
          address: systemInboxAddress(userId),
          userId,
          expiresAt: SYSTEM_INBOX_EXPIRES_AT,
        }))
      )
      .onConflictDoNothing()

    const rows = await db.query.emails.findMany({
      where: and(inArray(emails.userId, chunk), notLike(emails.address, "%@%")),
    })
    for (const row of rows) {
      if (row.userId) result.set(row.userId, row.id)
    }
  }

  return result
}

/**
 * 批量投递"内容各不相同"的系统消息，按 D1 参数上限分块。
 */
export async function insertSystemMessagesByInbox(
  db: Db,
  entries: { emailId: string; input: SystemMessageInput }[]
): Promise<number> {
  if (entries.length === 0) return 0

  let inserted = 0

  for (let i = 0; i < entries.length; i += MESSAGE_ROWS_PER_INSERT) {
    const chunk = entries.slice(i, i + MESSAGE_ROWS_PER_INSERT)
    await db
      .insert(messages)
      .values(chunk.map(({ emailId, input }) => toMessageValues(emailId, input)))
    inserted += chunk.length
  }

  return inserted
}

/**
 * 向一批用户批量投递"内容相同"的系统消息。
 * 调用方需先通过 ensureSystemInboxes 取得 inbox 映射。
 * 不支持去重——用于广播、配额调整这类本身就不应去重的场景。
 */
export async function insertSystemMessagesForUsers(
  db: Db,
  inboxByUser: Map<string, string>,
  userIds: string[],
  input: SystemMessageInput
): Promise<number> {
  const entries = userIds
    .map((userId) => inboxByUser.get(userId))
    .filter((emailId): emailId is string => !!emailId)
    .map((emailId) => ({ emailId, input }))

  return insertSystemMessagesByInbox(db, entries)
}