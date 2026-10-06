import { createDb } from "@/lib/db"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { and, eq, gt, like, lt, or, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { emails } from "@/lib/schema"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { getUserId } from "@/lib/apiKey"
import { ensureSystemInbox } from "@/lib/system-inbox"

export const runtime = "edge"

const PAGE_SIZE = 20

export async function GET(request: Request) {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const type = searchParams.get('type')
  
  const db = createDb()

  try {
    // 系统收件箱单独获取，固定在邮箱列表顶部展示
    if (type === 'system') {
      const { inbox } = await ensureSystemInbox(db, userId, getRequestContext().env.SITE_CONFIG)
      return NextResponse.json({
        emails: [inbox],
        nextCursor: null,
        total: 1
      })
    }

    // 普通邮箱列表只取含 @ 的真实邮箱，排除系统收件箱（哨兵地址不含 @），避免污染分页与数量统计
    const baseConditions = and(
      eq(emails.userId, userId),
      gt(emails.expiresAt, new Date()),
      like(emails.address, '%@%')
    )

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(baseConditions)
    const totalCount = Number(totalResult[0].count)

    const conditions = [baseConditions]

    if (cursor) {
      const { timestamp, id } = decodeCursor(cursor)
      conditions.push(
        or(
          lt(emails.createdAt, new Date(timestamp)),
          and(
            eq(emails.createdAt, new Date(timestamp)),
            lt(emails.id, id)
          )
        )
      )
    }

    const results = await db.query.emails.findMany({
      where: and(...conditions),
      orderBy: (emails, { desc }) => [
        desc(emails.createdAt),
        desc(emails.id)
      ],
      limit: PAGE_SIZE + 1
    })
    
    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore 
      ? encodeCursor(
          results[PAGE_SIZE - 1].createdAt.getTime(),
          results[PAGE_SIZE - 1].id
        )
      : null
    const emailList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({ 
      emails: emailList,
      nextCursor,
      total: totalCount
    })
  } catch (error) {
    console.error('Failed to fetch user emails:', error)
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    )
  }
} 