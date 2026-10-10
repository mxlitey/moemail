import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { bindRecoveryEmailSchema, normalizeRecoveryEmail } from "@/lib/validation"

export const runtime = "edge"

/** 读取当前用户的恢复邮箱，用于表单回显 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "未授权" }, { status: 401 })
  }

  const db = createDb()
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { recoveryEmail: true },
  })

  return Response.json({ recoveryEmail: user?.recoveryEmail ?? null })
}

/** 绑定 / 换绑 / 解绑恢复邮箱（留空表示解绑） */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: "未授权" }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: "请求格式不正确" }, { status: 400 })
    }

    const parsed = bindRecoveryEmailSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "邮箱格式不正确" },
        { status: 400 }
      )
    }

    const normalized = normalizeRecoveryEmail(parsed.data.recoveryEmail)
    const db = createDb()

    // 恢复邮箱唯一：换绑到他人已占用的邮箱时给出明确提示
    if (normalized) {
      const taken = await db.query.users.findFirst({
        where: eq(users.recoveryEmail, normalized),
        columns: { id: true },
      })

      if (taken && taken.id !== session.user.id) {
        return Response.json({ error: "该邮箱已被其他账号绑定" }, { status: 409 })
      }
    }

    await db
      .update(users)
      .set({ recoveryEmail: normalized })
      .where(eq(users.id, session.user.id))

    return Response.json({ success: true, recoveryEmail: normalized })
  } catch (error) {
    console.error("Failed to update recovery email:", error)
    return Response.json({ error: "保存失败" }, { status: 500 })
  }
}