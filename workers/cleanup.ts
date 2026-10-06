import { drizzle } from 'drizzle-orm/d1'
import { lt, inArray } from 'drizzle-orm'
import * as schema from '../app/lib/schema'
import type { Db } from '../app/lib/db'
import { ensureSystemInboxes, insertSystemMessagesByInbox, isSystemInbox } from '../app/lib/system-inbox'
import type { SystemMessageInput } from '../app/lib/system-inbox'

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

type ExpiredEmail = {
  userId: string | null
  address: string
}

/**
 * 聚合投递"邮箱已过期并删除"通知：每个用户一条，列出本次被清理的邮箱地址。
 * 通知属于副作用，内部吞掉异常，绝不阻塞后续删除。
 */
async function notifyExpiredEmails(db: Db, expired: ExpiredEmail[]) {
  try {
    const addressByUser = new Map<string, string[]>()

    for (const row of expired) {
      // 匿名邮箱（userId 为空）与系统收件箱（理论上不会过期，双保险）不通知
      if (!row.userId || isSystemInbox(row.address)) continue
      const list = addressByUser.get(row.userId) ?? []
      list.push(row.address)
      addressByUser.set(row.userId, list)
    }

    if (addressByUser.size === 0) return

    const userIds = Array.from(addressByUser.keys())
    const inboxByUser = await ensureSystemInboxes(db, userIds)

    const entries: { emailId: string; input: SystemMessageInput }[] = []
    for (const userId of userIds) {
      const emailId = inboxByUser.get(userId)
      if (!emailId) continue
      const addresses = addressByUser.get(userId) ?? []
      entries.push({
        emailId,
        input: {
          subject: '邮箱已过期并删除',
          content: `您的 ${addresses.length} 个邮箱已过期并被删除：\n${addresses.join('\n')}`,
        },
      })
    }

    await insertSystemMessagesByInbox(db, entries)
  } catch (error) {
    console.error('Failed to notify expired emails:', error)
  }
}

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
        columns: { id: true, userId: true, address: true },
        limit: CLEANUP_CONFIG.BATCH_SIZE,
      })

      if (expired.length === 0) {
        console.log('No expired emails to clean up')
        return
      }

      // 通知失败不影响删除
      await notifyExpiredEmails(db, expired)

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
