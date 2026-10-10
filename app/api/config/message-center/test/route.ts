import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { eq } from "drizzle-orm"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS, ROLES } from "@/lib/permissions"
import { createDb } from "@/lib/db"
import { roles, userRoles } from "@/lib/schema"
import {
  NOTIFICATION_CONTENT_MAX_LENGTH,
  NOTIFICATION_SUBJECT_MAX_LENGTH,
  NOTIFICATION_TEMPLATE_TYPES,
  renderMessageTemplate,
  resolveNotificationTemplate,
} from "@/config"
import type { NotificationTemplateType } from "@/config"
import {
  buildPlaceholderContexts,
  ensureSystemInboxes,
  insertSystemMessagesByInbox,
} from "@/lib/system-inbox"

export const runtime = "edge"

/**
 * 测试发送给专属占位符的示例值，让管理员不用等真实事件就能看到渲染效果。
 * 通用占位符（用户名、角色、额度、客服邮箱）取皇帝的真实配置，不在这里造。
 */
const SAMPLE_EXTRAS: Record<NotificationTemplateType, Record<string, string>> = {
  welcome: {},
  roleChange: { oldRole: "骑士", newRole: "皇帝" },
  passwordReset: {},
  quotaChange: { fromLimit: "2", toLimit: "5" },
  domainChanged: { addresses: "demo@old-domain.com\nlegacy@old-domain.com" },
}

function isTemplateType(value: string): value is NotificationTemplateType {
  return (NOTIFICATION_TEMPLATE_TYPES as readonly string[]).includes(value)
}

/**
 * 试发一条站内通知到所有皇帝的系统收件箱。
 * 走与正式发送完全相同的渲染与落库链路，因此看到的效果即真实效果。
 */
export async function POST(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      type?: string
      subject?: string
      content?: string
    }

    const { type } = body
    if (!type || !isTemplateType(type)) {
      return NextResponse.json({ error: "不支持的通知类型" }, { status: 400 })
    }

    const subject = (body.subject ?? "").trim()
    const content = (body.content ?? "").trim()

    if (
      subject.length > NOTIFICATION_SUBJECT_MAX_LENGTH ||
      content.length > NOTIFICATION_CONTENT_MAX_LENGTH
    ) {
      return NextResponse.json({ error: "标题或正文超出长度上限" }, { status: 400 })
    }

    const env = getRequestContext().env
    const db = createDb()

    // 收件人为所有皇帝，去重后批量投递
    const emperorRows = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(roles.name, ROLES.EMPEROR))

    const userIds = Array.from(new Set(emperorRows.map((row) => row.userId)))
    if (userIds.length === 0) {
      return NextResponse.json({ error: "未找到皇帝用户" }, { status: 400 })
    }

    // 测试用的是面板里未保存的草稿：留空同样回退到内置默认文案
    const resolved = resolveNotificationTemplate(type, subject, content)
    const extras = SAMPLE_EXTRAS[type]

    const inboxByUser = await ensureSystemInboxes(db, userIds)
    const contextByUser = await buildPlaceholderContexts(db, userIds, env.SITE_CONFIG)

    const entries = userIds
      .map((userId) => {
        const emailId = inboxByUser.get(userId)
        if (!emailId) return null

        const ctx = contextByUser.get(userId) ?? { userId }
        return {
          emailId,
          input: {
            subject: renderMessageTemplate(resolved.subject, ctx, extras),
            content: renderMessageTemplate(resolved.content, ctx, extras),
          },
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)

    const sent = await insertSystemMessagesByInbox(db, entries)

    return NextResponse.json({ success: true, sent })
  } catch (error) {
    console.error("Failed to send test notification:", error)
    return NextResponse.json({ error: "测试消息发送失败" }, { status: 500 })
  }
}