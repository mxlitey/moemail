import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { or, eq } from "drizzle-orm"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { loadNotificationEmail, sendSystemEmail } from "@/lib/system-email"

export const runtime = "edge"

/** 重置令牌有效期（秒） */
const TOKEN_TTL_SECONDS = 30 * 60
/** 同一账号两次发送之间的冷却时间（秒），用于抑制刷屏 */
const COOLDOWN_SECONDS = 60

const tokenKey = (token: string) => `PASSWORD_RESET:${token}`
const cooldownKey = (userId: string) => `PASSWORD_RESET_COOLDOWN:${userId}`

const requestSchema = z.object({
  identifier: z.string().trim().min(1),
  locale: z.string().optional(),
})

export async function POST(request: Request) {
  // 账号不存在、未设置密码、发送失败等情况统一走 unknown：
  // 前端只提示"如果账号存在且已绑定恢复邮箱"，不暴露账号是否存在
  const unknownResponse = NextResponse.json({ success: true, status: "unknown" })

  try {
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return unknownResponse
    }

    const { identifier } = parsed.data
    // 仅用于挑选默认邮件文案的语言，未知语言由 getResetEmailDefault 回退到英文
    const locale = parsed.data.locale ?? "en"

    const env = getRequestContext().env
    const db = createDb()

    const user = await db.query.users.findFirst({
      where: or(
        eq(users.username, identifier),
        eq(users.recoveryEmail, identifier.toLowerCase())
      ),
      columns: { id: true, username: true, name: true, recoveryEmail: true, password: true },
    })

    // 账号不存在或未设置密码（如纯 OAuth 账号）时，不透露任何信息
    if (!user || !user.password) {
      return unknownResponse
    }

    // 账号存在但未绑定恢复邮箱：明确引导用户联系管理员
    if (!user.recoveryEmail) {
      return NextResponse.json({ success: true, status: "no-recovery-email" })
    }

    // 冷却期内不重复发信，但仍告知用户链接已发送
    if (await env.SITE_CONFIG.get(cooldownKey(user.id))) {
      return NextResponse.json({ success: true, status: "sent" })
    }

    const token = crypto.randomUUID()
    // 不携带语言前缀，由中间件按访客偏好重定向到对应语言的重置页
    const link = `${new URL(request.url).origin}/reset-password?token=${token}`

    // 邮件文案来自「通知邮件」配置，未配置时使用内置默认模板
    const { subject, content } = await loadNotificationEmail(
      env.SITE_CONFIG,
      "resetPasswordEmail",
      locale,
      {
        username: user.username ?? "",
        name: user.name ?? "",
        email: user.recoveryEmail,
        link,
      }
    )

    const sent = await sendSystemEmail(env.SITE_CONFIG, user.recoveryEmail, subject, content)

    if (sent) {
      await env.SITE_CONFIG.put(
        tokenKey(token),
        JSON.stringify({ userId: user.id }),
        { expirationTtl: TOKEN_TTL_SECONDS }
      )
      await env.SITE_CONFIG.put(cooldownKey(user.id), "1", { expirationTtl: COOLDOWN_SECONDS })

      return NextResponse.json({ success: true, status: "sent" })
    }

    // 发件服务或发件地址未配置、或发送失败：不误导用户去查收不存在的邮件
    return unknownResponse
  } catch (error) {
    console.error("Failed to handle forgot password:", error)
    return unknownResponse
  }
}