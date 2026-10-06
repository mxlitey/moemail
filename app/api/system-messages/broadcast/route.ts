import { NextResponse } from "next/server"
import { and, eq, gt, sql } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS, ROLES } from "@/lib/permissions"
import type { Role } from "@/lib/permissions"
import { createDb } from "@/lib/db"
import type { Db } from "@/lib/db"
import { users, roles, userRoles } from "@/lib/schema"
import {
  SYSTEM_ANNOUNCEMENT_FROM,
  ensureSystemInboxes,
  insertSystemMessagesByInbox,
} from "@/lib/system-inbox"
import { renderMessageTemplate } from "@/config"
import type { PlaceholderContext } from "@/config"

export const runtime = "edge"

/** 单次请求最多处理的收件人数量，客户端按 cursor 分页驱动直到 done */
const CHUNK_SIZE = 100

type BroadcastRole = "all" | Role

/** 收件人及其占位符上下文 */
type Recipient = {
  id: string
  username: string | null
  name: string | null
  email: string | null
}

const BROADCAST_ROLES: BroadcastRole[] = [
  "all",
  ROLES.EMPEROR,
  ROLES.DUKE,
  ROLES.KNIGHT,
  ROLES.CIVILIAN,
]

function isBroadcastRole(value: unknown): value is BroadcastRole {
  return typeof value === "string" && (BROADCAST_ROLES as string[]).includes(value)
}

async function countRecipients(db: Db, role: BroadcastRole): Promise<number> {
  if (role === "all") {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(users)
    return Number(row?.count ?? 0)
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(roles.name, role))

  return Number(row?.count ?? 0)
}

/** 收件人查询所需的列，含占位符上下文 */
const RECIPIENT_COLUMNS = {
  id: users.id,
  username: users.username,
  name: users.name,
  email: users.email,
}

/**
 * 按 userId 升序取一批收件人，cursor 为上一批的最后一个 userId。
 * 内置角色表与用户表均为纯文本主键，字典序稳定，适合做游标分页。
 */
async function fetchRecipientChunk(
  db: Db,
  role: BroadcastRole,
  cursor: string | null,
  limit: number
): Promise<Recipient[]> {
  const cursorCondition = cursor ? gt(users.id, cursor) : undefined

  if (role === "all") {
    return await db
      .select(RECIPIENT_COLUMNS)
      .from(users)
      .where(cursorCondition)
      .orderBy(users.id)
      .limit(limit)
  }

  return await db
    .select(RECIPIENT_COLUMNS)
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(cursorCondition ? and(eq(roles.name, role), cursorCondition) : eq(roles.name, role))
    .orderBy(users.id)
    .limit(limit)
}

/** 预检：统计收件人数量与预计分批次数，供前端二次确认提示 */
export async function GET(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  const roleParam = new URL(request.url).searchParams.get("role") ?? "all"
  if (!isBroadcastRole(roleParam)) {
    return NextResponse.json({ error: "无效的角色" }, { status: 400 })
  }

  try {
    const db = createDb()
    const total = await countRecipients(db, roleParam)
    return NextResponse.json({
      total,
      chunks: Math.ceil(total / CHUNK_SIZE),
    })
  } catch (error) {
    console.error("Failed to count broadcast recipients:", error)
    return NextResponse.json({ error: "统计收件人失败" }, { status: 500 })
  }
}

/** 处理一个分批：投递 CHUNK_SIZE 位用户后返回下一游标 */
export async function POST(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)
  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      title?: string
      content?: string
      html?: string
      role?: string
      cursor?: string | null
    }

    const title = body.title?.trim()
    const content = body.content ?? ""

    if (!title) {
      return NextResponse.json({ error: "标题不能为空" }, { status: 400 })
    }
    if (!content.trim()) {
      return NextResponse.json({ error: "内容不能为空" }, { status: 400 })
    }
    if (!isBroadcastRole(body.role)) {
      return NextResponse.json({ error: "无效的角色" }, { status: 400 })
    }

    const db = createDb()
    const recipients = await fetchRecipientChunk(db, body.role, body.cursor ?? null, CHUNK_SIZE)

    if (recipients.length === 0) {
      return NextResponse.json({ done: true, nextCursor: null, sent: 0 })
    }

    const userIds = recipients.map((recipient) => recipient.id)
    const inboxByUser = await ensureSystemInboxes(db, userIds)

    // 按人渲染占位符后再逐条投递（html 保持原样，不参与替换）
    const entries = recipients
      .map((recipient) => {
        const emailId = inboxByUser.get(recipient.id)
        if (!emailId) return null

        const ctx: PlaceholderContext = {
          userId: recipient.id,
          username: recipient.username,
          name: recipient.name,
          email: recipient.email,
        }

        return {
          emailId,
          input: {
            subject: renderMessageTemplate(title, ctx),
            content: renderMessageTemplate(content, ctx),
            html: body.html,
            fromAddress: SYSTEM_ANNOUNCEMENT_FROM,
          },
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)

    const sent = await insertSystemMessagesByInbox(db, entries)

    return NextResponse.json({
      done: recipients.length < CHUNK_SIZE,
      nextCursor: recipients[recipients.length - 1].id,
      sent,
    })
  } catch (error) {
    console.error("Failed to broadcast system message:", error)
    return NextResponse.json({ error: "广播失败" }, { status: 500 })
  }
}
