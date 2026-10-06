import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { EMAIL_CONFIG } from "@/config"
import { createDb } from "@/lib/db"
import { roles, userRoles } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { ensureSystemInboxes, insertSystemMessagesForUsers } from "@/lib/system-inbox"

export const runtime = "edge"

interface EmailServiceConfig {
  enabled: boolean
  apiKey: string
  roleLimits: {
    duke?: number
    knight?: number
  }
}

export async function GET() {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({
      error: "权限不足"
    }, { status: 403 })
  }

  try {
    const env = getRequestContext().env
    const [enabled, apiKey, roleLimits] = await Promise.all([
      env.SITE_CONFIG.get("EMAIL_SERVICE_ENABLED"),
      env.SITE_CONFIG.get("RESEND_API_KEY"),
      env.SITE_CONFIG.get("EMAIL_ROLE_LIMITS")
    ])

    const customLimits = roleLimits ? JSON.parse(roleLimits) : {}
    
    const finalLimits = {
      duke: customLimits.duke !== undefined ? customLimits.duke : EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.duke,
      knight: customLimits.knight !== undefined ? customLimits.knight : EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.knight,
    }

    return NextResponse.json({
      enabled: enabled === "true",
      apiKey: apiKey || "",
      roleLimits: finalLimits
    })
  } catch (error) {
    console.error("Failed to get email service config:", error)
    return NextResponse.json(
      { error: "获取 Resend 发件服务配置失败" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({
      error: "权限不足"
    }, { status: 403 })
  }

  try {
    const config = await request.json() as EmailServiceConfig

    if (config.enabled && !config.apiKey) {
      return NextResponse.json(
        { error: "启用 Resend 时，API Key 为必填项" },
        { status: 400 }
      )
    }

    const env = getRequestContext().env

    // 读取旧配额，用于变更对比
    const previousRaw = await env.SITE_CONFIG.get("EMAIL_ROLE_LIMITS")
    const previousLimits = (previousRaw ? JSON.parse(previousRaw) : {}) as RoleLimits

    const customLimits: RoleLimits = {}
    if (config.roleLimits?.duke !== undefined) {
      customLimits.duke = config.roleLimits.duke
    }
    if (config.roleLimits?.knight !== undefined) {
      customLimits.knight = config.roleLimits.knight
    }

    await Promise.all([
      env.SITE_CONFIG.put("EMAIL_SERVICE_ENABLED", config.enabled.toString()),
      env.SITE_CONFIG.put("RESEND_API_KEY", config.apiKey),
      env.SITE_CONFIG.put("EMAIL_ROLE_LIMITS", JSON.stringify(customLimits))
    ])

    // 只通知配额真正变化的角色；通知失败不影响配置保存结果
    try {
      await notifyQuotaChanges(previousLimits, customLimits)
    } catch (error) {
      console.error("Failed to notify quota changes:", error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save email service config:", error)
    return NextResponse.json(
      { error: "保存 Resend 发件服务配置失败" },
      { status: 500 }
    )
  }
}

type RoleLimits = { duke?: number; knight?: number }

/**
 * 对比配额变更，向受影响角色的用户投递系统通知。
 * 仅在角色配额真正变化时发送——这是离散事件，不做去重。
 */
async function notifyQuotaChanges(previous: RoleLimits, next: RoleLimits) {
  const defaults = EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS
  const changes: { role: "duke" | "knight"; from: number; to: number }[] = []

  for (const role of ["duke", "knight"] as const) {
    const from = previous[role] ?? defaults[role]
    const to = next[role] ?? defaults[role]
    if (from !== to) {
      changes.push({ role, from, to })
    }
  }

  if (changes.length === 0) return

  const db = createDb()

  for (const change of changes) {
    const rows = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(roles.name, change.role))

    const userIds = rows.map((row) => row.userId)
    const inboxByUser = await ensureSystemInboxes(db, userIds)

    await insertSystemMessagesForUsers(db, inboxByUser, userIds, {
      subject: "您的发件配额已调整",
      content: `您的每日发件配额已从 ${change.from} 封调整为 ${change.to} 封。`,
    })
  }
} 