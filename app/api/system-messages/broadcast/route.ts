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
  insertSystemMessagesForUsers,
} from "@/lib/system-inbox"

export const runtime = "edge"

/** 单次请求最多处理的收件人数量，客户端按 cursor 分页驱动直到 done */
const CHUNK_SIZE = 100

type BroadcastRole = "all" | Role

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

/**
 * 按 userId 升序取一批收件人，cursor 为上一批的最后一个 userId。
 * 内置角色表与用户表均为纯文本主键，字典序稳定，适合做游标分页。
 */
async function fetchRecipientChunk(
  db: Db,
  role: BroadcastRole,
  cursor: string | null,
  limit: number
): Promise<string[]> {
  const cursorCondition = cursor ? gt(users.id, cursor) : undefined

  if (role === "all") {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(cursorCondition)
      .orderBy(users.id)
      .limit(limit)
    return rows.map((row) => row.id)
  }

  const rows = await db
    .select({ id: users.id })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(cursorCondition ? and(eq(roles.name, role), cursorCondition) : eq(roles.name, role))
    .orderBy(users.id)
    .limit(limit)

  return rows.map((row) => row.id)
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
    const userIds = await fetchRecipientChunk(db, body.role, body.cursor ?? null, CHUNK_SIZE)

    if (userIds.length === 0) {
      return NextResponse.json({ done: true, nextCursor: null, sent: 0 })
    }

    const inboxByUser = await ensureSystemInboxes(db, userIds)
    const sent = await insertSystemMessagesForUsers(db, inboxByUser, userIds, {
      subject: title,
      content,
      html: body.html,
      fromAddress: SYSTEM_ANNOUNCEMENT_FROM,
    })

    return NextResponse.json({
      done: userIds.length < CHUNK_SIZE,
      nextCursor: userIds[userIds.length - 1],
      sent,
    })
  } catch (error) {
    console.error("Failed to broadcast system message:", error)
    return NextResponse.json({ error: "广播失败" }, { status: 500 })
  }
}
