import { drizzle } from 'drizzle-orm/d1'
import { lt, inArray } from 'drizzle-orm'
import * as schema from '../app/lib/schema'

const { emails } = schema

interface Env {
  DB: D1Database
}

const CLEANUP_CONFIG = {
  // Whether to delete expired emails
  DELETE_EXPIRED_EMAILS: true,

  // Batch processing size
  BATCH_SIZE: 100,

  // DELETE 语句按 id 分批删除，避免触及 D1 单条 SQL 100 个绑定参数的上限
  DELETE_CHUNK_SIZE: 50,
} as const

const main = {
  async scheduled(_: ScheduledEvent, env: Env) {
    try {
      if (!CLEANUP_CONFIG.DELETE_EXPIRED_EMAILS) {
        console.log('Expired email deletion is disabled')
        return
      }

      const db = drizzle(env.DB, { schema })

      // 先查出待清理的过期邮箱（系统收件箱 expires_at 为 9999 年，不会命中）
      const expired = await db.query.emails.findMany({
        where: lt(emails.expiresAt, new Date()),
        columns: { id: true },
        limit: CLEANUP_CONFIG.BATCH_SIZE,
      })

      if (expired.length === 0) {
        console.log('No expired emails to clean up')
        return
      }

      // 按 id 精确删除，message 表通过外键级联清理
      const ids = expired.map((row) => row.id)
      for (let i = 0; i < ids.length; i += CLEANUP_CONFIG.DELETE_CHUNK_SIZE) {
        await db
          .delete(emails)
          .where(inArray(emails.id, ids.slice(i, i + CLEANUP_CONFIG.DELETE_CHUNK_SIZE)))
      }

      console.log(`Deleted ${ids.length} expired emails and their associated messages`)
    } catch (error) {
      console.error('Failed to cleanup:', error)
      throw error
    }
  }
}

export default main
