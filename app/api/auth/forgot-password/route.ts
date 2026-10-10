import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { or, eq } from "drizzle-orm"
import { z } from "zod"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { sendSystemEmail } from "@/lib/system-email"

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

type ResetEmailCopy = {
  subject: string
  title: string
  body: string
  button: string
  ignore: string
}

/** 重置邮件的本地化文案；未知语言回退到英文 */
const RESET_EMAIL_COPY: Record<string, ResetEmailCopy> = {
  en: {
    subject: "Reset your MoeMail password",
    title: "Password reset",
    body: "We received a request to reset the password for your account. Click the button below to set a new password. The link expires in 30 minutes.",
    button: "Reset password",
    ignore: "If you did not request this, you can safely ignore this email.",
  },
  "zh-CN": {
    subject: "重置您的 MoeMail 密码",
    title: "重置密码",
    body: "我们收到了重置您账号密码的请求。请点击下方按钮设置新密码，链接 30 分钟内有效。",
    button: "重置密码",
    ignore: "如果这不是您本人的操作，请忽略本邮件。",
  },
  "zh-TW": {
    subject: "重設您的 MoeMail 密碼",
    title: "重設密碼",
    body: "我們收到了重設您帳號密碼的請求。請點擊下方按鈕設定新密碼，連結 30 分鐘內有效。",
    button: "重設密碼",
    ignore: "如果這不是您本人的操作，請忽略本郵件。",
  },
  ja: {
    subject: "MoeMail のパスワードをリセット",
    title: "パスワードのリセット",
    body: "アカウントのパスワードリセットのリクエストを受け付けました。下のボタンから新しいパスワードを設定してください。リンクの有効期限は 30 分です。",
    button: "パスワードをリセット",
    ignore: "心当たりがない場合は、このメールを無視してください。",
  },
  ko: {
    subject: "MoeMail 비밀번호 재설정",
    title: "비밀번호 재설정",
    body: "계정 비밀번호 재설정 요청을 받았습니다. 아래 버튼을 눌러 새 비밀번호를 설정하세요. 링크는 30분 동안 유효합니다.",
    button: "비밀번호 재설정",
    ignore: "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.",
  },
}

function buildResetEmailHtml(copy: ResetEmailCopy, link: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
  <h2 style="font-size:20px;margin:0 0 16px;">${copy.title}</h2>
  <p style="font-size:14px;line-height:1.6;margin:0 0 24px;">${copy.body}</p>
  <p style="margin:0 0 24px;">
    <a href="${link}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;">${copy.button}</a>
  </p>
  <p style="font-size:12px;line-height:1.6;word-break:break-all;color:#6b7280;margin:0 0 16px;">${link}</p>
  <p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:0;">${copy.ignore}</p>
</div>`
}

export async function POST(request: Request) {
  // 无论账号是否存在或是否发送成功，都返回同一结果，避免账号枚举
  const genericResponse = NextResponse.json({ success: true })

  try {
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return genericResponse
    }

    const { identifier } = parsed.data
    const locale =
      parsed.data.locale && RESET_EMAIL_COPY[parsed.data.locale] ? parsed.data.locale : "en"

    const env = getRequestContext().env
    const db = createDb()

    const user = await db.query.users.findFirst({
      where: or(
        eq(users.username, identifier),
        eq(users.recoveryEmail, identifier.toLowerCase())
      ),
      columns: { id: true, recoveryEmail: true, password: true },
    })

    // 仅当账号存在、已设置密码且绑定了恢复邮箱时才实际发送
    if (!user || !user.password || !user.recoveryEmail) {
      return genericResponse
    }

    if (await env.SITE_CONFIG.get(cooldownKey(user.id))) {
      return genericResponse
    }

    const token = crypto.randomUUID()
    // 不携带语言前缀，由中间件按访客偏好重定向到对应语言的重置页
    const link = `${new URL(request.url).origin}/reset-password?token=${token}`

    const sent = await sendSystemEmail(
      env.SITE_CONFIG,
      user.recoveryEmail,
      RESET_EMAIL_COPY[locale].subject,
      buildResetEmailHtml(RESET_EMAIL_COPY[locale], link)
    )

    if (sent) {
      await env.SITE_CONFIG.put(
        tokenKey(token),
        JSON.stringify({ userId: user.id }),
        { expirationTtl: TOKEN_TTL_SECONDS }
      )
      await env.SITE_CONFIG.put(cooldownKey(user.id), "1", { expirationTtl: COOLDOWN_SECONDS })
    }

    return genericResponse
  } catch (error) {
    console.error("Failed to handle forgot password:", error)
    return genericResponse
  }
}