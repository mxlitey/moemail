import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { eq } from "drizzle-orm"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { resetPasswordSchema } from "@/lib/validation"
import { hashPassword } from "@/lib/utils"

export const runtime = "edge"

const tokenKey = (token: string) => `PASSWORD_RESET:${token}`

const INVALID_LINK_MESSAGE = "重置链接无效或已过期"

export async function POST(request: Request) {
  try {
    const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "参数不正确" },
        { status: 400 }
      )
    }

    const { token, password } = parsed.data
    const env = getRequestContext().env

    const raw = await env.SITE_CONFIG.get(tokenKey(token))
    if (!raw) {
      return NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 400 })
    }

    let userId: string | undefined
    try {
      userId = (JSON.parse(raw) as { userId?: string }).userId
    } catch {
      userId = undefined
    }

    if (!userId) {
      await env.SITE_CONFIG.delete(tokenKey(token))
      return NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 400 })
    }

    const db = createDb()
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true },
    })

    if (!user) {
      await env.SITE_CONFIG.delete(tokenKey(token))
      return NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 400 })
    }

    await db
      .update(users)
      .set({ password: await hashPassword(password) })
      .where(eq(users.id, user.id))

    // 令牌一次性使用，重置成功立即失效
    await env.SITE_CONFIG.delete(tokenKey(token))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to reset password:", error)
    return NextResponse.json({ error: "重置密码失败" }, { status: 500 })
  }
}