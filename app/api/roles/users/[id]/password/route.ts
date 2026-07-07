import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { ROLES } from "@/lib/permissions"
import { hashPassword } from "@/lib/utils"

export const runtime = "edge"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return Response.json({ error: "缺少用户 ID" }, { status: 400 })
    }

    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: "未授权" }, { status: 401 })
    }

    if (session.user.id === id) {
      return Response.json({ error: "不能通过此接口修改当前登录用户的密码" }, { status: 400 })
    }

    const { password } = await request.json() as { password: string }

    if (!password || typeof password !== "string") {
      return Response.json({ error: "请提供新密码" }, { status: 400 })
    }

    if (password.length < 8) {
      return Response.json({ error: "密码长度必须大于等于 8 位" }, { status: 400 })
    }

    const db = createDb()

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        userRoles: {
          with: { role: true },
        },
      },
    })

    if (!targetUser) {
      return Response.json({ error: "用户不存在" }, { status: 404 })
    }

    if (targetUser.userRoles[0]?.role.name === ROLES.EMPEROR) {
      return Response.json({ error: "不能修改皇帝的密码" }, { status: 400 })
    }

    if (!targetUser.username) {
      return Response.json({ error: "该用户不支持密码修改（仅 OAuth 注册用户）" }, { status: 400 })
    }

    const hashedPassword = await hashPassword(password)

    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to update user password:", error)
    return Response.json({ error: "修改密码失败" }, { status: 500 })
  }
}
