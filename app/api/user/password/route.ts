import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { comparePassword, hashPassword } from "@/lib/utils"

export const runtime = "edge"

/** 当前登录用户自助修改密码（仅适用于已设置密码的用户名/密码账号） */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: "未授权" }, { status: 401 })
    }

    const { currentPassword, newPassword } = (await request.json()) as {
      currentPassword?: string
      newPassword?: string
    }

    if (!currentPassword || !newPassword) {
      return Response.json({ error: "请填写当前密码与新密码" }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return Response.json({ error: "新密码长度必须大于等于 8 位" }, { status: 400 })
    }

    const db = createDb()
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { id: true, password: true },
    })

    if (!user) {
      return Response.json({ error: "用户不存在" }, { status: 404 })
    }

    if (!user.password) {
      return Response.json({ error: "当前账号未设置密码，无法修改" }, { status: 400 })
    }

    const isValid = await comparePassword(currentPassword, user.password)
    if (!isValid) {
      return Response.json({ error: "当前密码不正确" }, { status: 400 })
    }

    await db
      .update(users)
      .set({ password: await hashPassword(newPassword) })
      .where(eq(users.id, user.id))

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to change password:", error)
    return Response.json({ error: "修改密码失败" }, { status: 500 })
  }
}