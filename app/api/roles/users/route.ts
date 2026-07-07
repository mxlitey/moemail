import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { eq, like, or, sql } from "drizzle-orm"

export const runtime = "edge"

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 100

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const searchText = searchParams.get("search")?.trim() ?? ""
    const page = Math.max(1, Number(searchParams.get("page")) || 1)
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE)
    )

    const db = createDb()

    const whereCondition = searchText
      ? or(
          like(users.username, `%${searchText}%`),
          like(users.email, `%${searchText}%`),
        )
      : undefined

    // 查询总数
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereCondition ?? sql`1=1`)
    const total = Number(totalResult[0].count)

    // 分页查询
    const userList = await db.query.users.findMany({
      where: whereCondition ?? undefined,
      with: {
        userRoles: {
          with: {
            role: true,
          },
        },
      },
      orderBy: (users, { asc }) => [asc(users.email), asc(users.id)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })

    return Response.json({
      users: userList.map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.userRoles[0]?.role.name,
      })),
      total,
      page,
      pageSize,
    })
  } catch (error) {
    console.error("Failed to fetch users:", error)
    return Response.json(
      { error: "获取用户列表失败" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const { searchText } = json as { searchText: string }

    if (!searchText) {
      return Response.json({ error: "请提供用户名或邮箱地址" }, { status: 400 })
    }

    const db = createDb()

    const user = await db.query.users.findFirst({
      where: searchText.includes('@') ? eq(users.email, searchText) : eq(users.username, searchText),
      with: {
        userRoles: {
          with: {
            role: true
          }
        }
      }
    });

    if (!user) {
      return Response.json({ error: "未找到用户" }, { status: 404 })
    }

    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.userRoles[0]?.role.name
      }
    })
  } catch (error) {
    console.error("Failed to find user:", error)
    return Response.json(
      { error: "查询用户失败" },
      { status: 500 }
    )
  }
}
