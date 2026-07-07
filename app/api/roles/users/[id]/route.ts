import { createDb } from "@/lib/db"
import { users, userRoles, accounts, apiKeys, webhooks, emails } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { ROLES } from "@/lib/permissions"

export const runtime = "edge"

export async function DELETE(
  _request: Request,
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
      return Response.json({ error: "不能删除当前登录用户" }, { status: 400 })
    }

    const db = createDb()

    const targetUserRole = await db.query.userRoles.findFirst({
      where: eq(userRoles.userId, id),
      with: { role: true },
    })

    if (targetUserRole?.role.name === ROLES.EMPEROR) {
      return Response.json({ error: "不能删除皇帝" }, { status: 400 })
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, id),
    })

    if (!targetUser) {
      return Response.json({ error: "用户不存在" }, { status: 404 })
    }

    // apiKeys 表没有设置 onDelete: cascade，需要先手动删除
    await db.delete(apiKeys).where(eq(apiKeys.userId, id))
    // webhooks 表已配置 cascade，但显式删除可保证兼容性
    await db.delete(webhooks).where(eq(webhooks.userId, id))
    // accounts 表已配置 cascade，但显式删除可保证兼容性
    await db.delete(accounts).where(eq(accounts.userId, id))
    // emails 表已配置 cascade（messages/emailShares/messageShares 都会级联），但显式删除可保证兼容性
    await db.delete(emails).where(eq(emails.userId, id))
    // userRoles 表已配置 cascade，但显式删除可保证兼容性
    await db.delete(userRoles).where(eq(userRoles.userId, id))
    // 最终删除用户
    await db.delete(users).where(eq(users.id, id))

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to delete user:", error)
    return Response.json({ error: "删除用户失败" }, { status: 500 })
  }
}
