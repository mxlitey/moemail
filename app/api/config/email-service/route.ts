import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { EMAIL_CONFIG, renderMessageTemplate } from "@/config"
import { createDb } from "@/lib/db"
import { roles, userRoles } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { buildPlaceholderContexts, ensureSystemInboxes, insertSystemMessagesByInbox, loadNotificationTemplate } from "@/lib/system-inbox"

export const runtime = "edge"

interface DomainApiKey {
  domain: string
  apiKey: string
}

interface EmailServiceConfig {
  enabled: boolean
  domainKeys: DomainApiKey[]
  roleLimits: {
    duke?: number
    knight?: number
  }
}

const RESEND_API_KEYS_KEY = "RESEND_API_KEYS"

/**
 * 将 KV 中存储的「域名 -> API Key」映射解析为配置项数组
 */
function parseDomainKeys(raw: string | null): DomainApiKey[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return Object.entries(parsed).map(([domain, apiKey]) => ({ domain, apiKey }))
  } catch (error) {
    console.error("Failed to parse resend domain keys:", error)
    return []
  }
}

/**
 * 清洗配置项：去除首尾空白、域名统一小写，并丢弃完全为空的行
 */
function normalizeDomainKeys(input: DomainApiKey[] | undefined): DomainApiKey[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item) => ({
      domain: (item?.domain ?? "").trim().toLowerCase(),
      apiKey: (item?.apiKey ?? "").trim()
    }))
    .filter((item) => item.domain || item.apiKey)
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
    const [enabled, domainKeysRaw, roleLimits] = await Promise.all([
      env.SITE_CONFIG.get("EMAIL_SERVICE_ENABLED"),
      env.SITE_CONFIG.get(RESEND_API_KEYS_KEY),
      env.SITE_CONFIG.get("EMAIL_ROLE_LIMITS")
    ])

    const customLimits = roleLimits ? JSON.parse(roleLimits) : {}
    
    const finalLimits = {
      duke: customLimits.duke !== undefined ? customLimits.duke : EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.duke,
      knight: customLimits.knight !== undefined ? customLimits.knight : EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.knight,
    }

    return NextResponse.json({
      enabled: enabled === "true",
      domainKeys: parseDomainKeys(domainKeysRaw),
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

    const domainKeys = normalizeDomainKeys(config.domainKeys)
    const domainKeyMap: Record<string, string> = {}

    for (const item of domainKeys) {
      if (!item.domain || !item.apiKey) {
        return NextResponse.json(
          { error: "域名与 API Key 均不能为空" },
          { status: 400 }
        )
      }
      if (domainKeyMap[item.domain]) {
        return NextResponse.json(
          { error: `域名 ${item.domain} 重复配置` },
          { status: 400 }
        )
      }
      domainKeyMap[item.domain] = item.apiKey
    }

    if (config.enabled && domainKeys.length === 0) {
      return NextResponse.json(
        { error: "启用 Resend 时，至少需要配置一个域名和 API Key" },
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
      env.SITE_CONFIG.put(RESEND_API_KEYS_KEY, JSON.stringify(domainKeyMap)),
      env.SITE_CONFIG.put("EMAIL_ROLE_LIMITS", JSON.stringify(customLimits))
    ])

    // 只通知配额真正变化的角色；通知失败不影响配置保存结果
    try {
      await notifyQuotaChanges(previousLimits, customLimits, env.SITE_CONFIG)
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
async function notifyQuotaChanges(
  previous: RoleLimits,
  next: RoleLimits,
  siteConfig: KVNamespace
) {
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
  const template = await loadNotificationTemplate(siteConfig, "quotaChange")

  for (const change of changes) {
    const rows = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(roles.name, change.role))

    const userIds = rows.map((row) => row.userId)
    const inboxByUser = await ensureSystemInboxes(db, userIds)
    const contextByUser = await buildPlaceholderContexts(db, userIds, siteConfig)

    // 标题/正文可能含通用占位符，需按用户逐条渲染
    const extras = { fromLimit: String(change.from), toLimit: String(change.to) }
    const entries = userIds
      .map((userId) => {
        const emailId = inboxByUser.get(userId)
        if (!emailId) return null

        const ctx = contextByUser.get(userId) ?? { userId }
        return {
          emailId,
          input: {
            subject: renderMessageTemplate(template.subject, ctx, extras),
            content: renderMessageTemplate(template.content, ctx, extras),
          },
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)

    await insertSystemMessagesByInbox(db, entries)
  }
} 