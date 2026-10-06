import { PERMISSIONS, Role, ROLES } from "@/lib/permissions"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { EMAIL_CONFIG } from "@/config"
import { checkPermission } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { emails } from "@/lib/schema"
import { like, or, sql } from "drizzle-orm"
import { ensureSystemInboxes, insertSystemMessagesByInbox } from "@/lib/system-inbox"
import type { SystemMessageInput } from "@/lib/system-inbox"

export const runtime = "edge"

export async function GET() {
  const env = getRequestContext().env
  const canManageConfig = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  const [
    defaultRole,
    emailDomains,
    adminContact,
    maxEmails,
    turnstileEnabled,
    turnstileSiteKey,
    turnstileSecretKey
  ] = await Promise.all([
    env.SITE_CONFIG.get("DEFAULT_ROLE"),
    env.SITE_CONFIG.get("EMAIL_DOMAINS"),
    env.SITE_CONFIG.get("ADMIN_CONTACT"),
    env.SITE_CONFIG.get("MAX_EMAILS"),
    env.SITE_CONFIG.get("TURNSTILE_ENABLED"),
    env.SITE_CONFIG.get("TURNSTILE_SITE_KEY"),
    env.SITE_CONFIG.get("TURNSTILE_SECRET_KEY")
  ])

  return Response.json({
    defaultRole: defaultRole || ROLES.CIVILIAN,
    emailDomains: emailDomains || "moemail.app",
    adminContact: adminContact || "",
    maxEmails: maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString(),
    turnstile: canManageConfig ? {
      enabled: turnstileEnabled === "true",
      siteKey: turnstileSiteKey || "",
      secretKey: turnstileSecretKey || "",
    } : undefined
  })
}

export async function POST(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return Response.json({
      error: "权限不足"
    }, { status: 403 })
  }

  const {
    defaultRole,
    emailDomains,
    adminContact,
    maxEmails,
    turnstile
  } = await request.json() as { 
    defaultRole: Exclude<Role, typeof ROLES.EMPEROR>,
    emailDomains: string,
    adminContact: string,
    maxEmails: string,
    turnstile?: {
      enabled: boolean,
      siteKey: string,
      secretKey: string
    }
  }
  
  if (![ROLES.DUKE, ROLES.KNIGHT, ROLES.CIVILIAN].includes(defaultRole)) {
    return Response.json({ error: "无效的角色" }, { status: 400 })
  }

  const turnstileConfig = turnstile ?? {
    enabled: false,
    siteKey: "",
    secretKey: ""
  }

  if (turnstileConfig.enabled && (!turnstileConfig.siteKey || !turnstileConfig.secretKey)) {
    return Response.json({ error: "Turnstile 启用时需要提供 Site Key 和 Secret Key" }, { status: 400 })
  }

  const env = getRequestContext().env

  // 读取旧域名列表，用于对比出被移除的域名并通知受影响用户
  const previousDomains = await env.SITE_CONFIG.get("EMAIL_DOMAINS")

  await Promise.all([
    env.SITE_CONFIG.put("DEFAULT_ROLE", defaultRole),
    env.SITE_CONFIG.put("EMAIL_DOMAINS", emailDomains),
    env.SITE_CONFIG.put("ADMIN_CONTACT", adminContact),
    env.SITE_CONFIG.put("MAX_EMAILS", maxEmails),
    env.SITE_CONFIG.put("TURNSTILE_ENABLED", turnstileConfig.enabled.toString()),
    env.SITE_CONFIG.put("TURNSTILE_SITE_KEY", turnstileConfig.siteKey),
    env.SITE_CONFIG.put("TURNSTILE_SECRET_KEY", turnstileConfig.secretKey)
  ])

  // 域名下线的通知失败不影响配置保存结果
  await notifyRemovedDomains(previousDomains, emailDomains)

  return Response.json({ success: true })
}

function parseDomains(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? "moemail.app")
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean)
  )
}

/**
 * 当可用域名被移除时，通知仍持有这些域名下邮箱的用户。
 * 邮箱地址形如 `{name}@{domain}`，系统收件箱不含 "@"，天然不会被命中。
 */
async function notifyRemovedDomains(previousRaw: string | null, nextRaw: string) {
  try {
    const previous = parseDomains(previousRaw)
    const next = parseDomains(nextRaw)
    const removed = Array.from(previous).filter((domain) => !next.has(domain))

    if (removed.length === 0) return

    const db = createDb()
    const rows = await db
      .select({ userId: emails.userId, address: emails.address })
      .from(emails)
      .where(
        or(
          ...removed.map((domain) =>
            like(sql`LOWER(${emails.address})`, `%@${domain}`)
          )
        )
      )

    const addressByUser = new Map<string, string[]>()
    for (const row of rows) {
      if (!row.userId) continue
      const list = addressByUser.get(row.userId) ?? []
      list.push(row.address)
      addressByUser.set(row.userId, list)
    }

    if (addressByUser.size === 0) return

    const userIds = Array.from(addressByUser.keys())
    const inboxByUser = await ensureSystemInboxes(db, userIds)

    const entries: { emailId: string; input: SystemMessageInput }[] = []
    for (const userId of userIds) {
      const emailId = inboxByUser.get(userId)
      if (!emailId) continue
      const addresses = addressByUser.get(userId) ?? []
      entries.push({
        emailId,
        input: {
          subject: "收件箱域名已变更",
          content: `以下邮箱所在域名已从可用域名中移除，可能无法继续接收邮件：\n${addresses.join("\n")}`,
        },
      })
    }

    await insertSystemMessagesByInbox(db, entries)
  } catch (error) {
    console.error("Failed to notify removed domains:", error)
  }
}
