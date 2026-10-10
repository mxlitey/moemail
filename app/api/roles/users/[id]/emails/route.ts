import { createDb } from "@/lib/db"
import { emails } from "@/lib/schema"
import { and, eq, like, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"

export const runtime = "edge"

/** 单次返回的邮箱数量上限，避免超大用户一次性拉取过多数据 */
const EMAIL_LIMIT = 100

/**
 * 后台查看某用户生成的邮箱。
 * 仅返回用户真实创建的邮箱（地址含 "@"），排除系统收件箱等内部哨兵地址。
 */
export async function GET(
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

    const db = createDb()
    const where = and(eq(emails.userId, id), like(emails.address, "%@%"))

    const [rows, totalResult] = await Promise.all([
      db.query.emails.findMany({
        where,
        columns: { id: true, address: true, createdAt: true, expiresAt: true },
        orderBy: (emails, { desc }) => [desc(emails.createdAt)],
        limit: EMAIL_LIMIT,
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(emails)
        .where(where),
    ])

    return Response.json({
      emails: rows,
      total: Number(totalResult[0]?.count ?? 0),
      limit: EMAIL_LIMIT,
    })
  } catch (error) {
    console.error("Failed to fetch user emails:", error)
    return Response.json({ error: "获取邮箱列表失败" }, { status: 500 })
  }
}