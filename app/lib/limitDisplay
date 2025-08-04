import { createDb } from "@/lib/db"
import { userRoles, roles, messages, emails } from "@/lib/schema"
import { eq, and, gte } from "drizzle-orm"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { EMAIL_CONFIG } from "@/config"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export interface EmailLimitResult {
  limitDisplay: string  // 显示用：∞ 或 "已发送数/每日限制数"
  error?: string
}

export const runtime = "edge"

export async function GET() {
  try {
    // 参考原代码通过auth()获取用户ID
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({
        limitDisplay: "",
        error: "未授权"
      }, { status: 401 })
    }

    // 获取用户ID
    const userId = session.user.id
    // 调用获取限制显示的方法
    const result = await getEmailLimitDisplay(userId)
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('获取邮件限制信息失败:', error)
    return NextResponse.json(
      { 
        limitDisplay: "", 
        error: "获取邮件限制信息失败" 
      },
      { status: 500 }
    )
  }
}

/**
 * 获取用户邮件限制的显示文本
 * @param userId 用户ID
 * @param skipDailyLimitCheck 是否跳过每日限制检查
 * @returns 包含显示文本的结果对象
 */
async function getEmailLimitDisplay(
  userId: string,
  skipDailyLimitCheck = false
): Promise<EmailLimitResult> {
  try {
    // 获取用户每日发送限制
    const userDailyLimit = await getUserDailyLimit(userId)

    // 无限制场景：直接返回∞
    if (skipDailyLimitCheck || userDailyLimit === 0) {
      return {
        limitDisplay: "∞"
      }
    }

    // 有限制场景：计算已发送数并返回 "已发送数/每日限制数"
    const db = createDb()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const sentTodayRecords = await db
      .select()
      .from(messages)
      .innerJoin(emails, eq(messages.emailId, emails.id))
      .where(
        and(
          eq(emails.userId, userId),
          eq(messages.type, "sent"),
          gte(messages.receivedAt, today)
        )
      )
    const sentToday = sentTodayRecords.length

    return {
      limitDisplay: `${sentToday}/${userDailyLimit}`
    }
  } catch (error) {
    console.error('获取邮件限制显示文本失败:', error)
    return {
      limitDisplay: "",
      error: "获取邮件限制信息失败"
    }
  }
}

/**
 * 获取用户每日发送限制
 */
async function getUserDailyLimit(userId: string): Promise<number> {
  try {
    const db = createDb()
    
    const userRoleData = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))

    const userRoleNames = userRoleData.map(r => r.roleName)

    const env = getRequestContext().env
    const roleLimitsStr = await env.SITE_CONFIG.get("EMAIL_ROLE_LIMITS")
    
    const customLimits = roleLimitsStr ? JSON.parse(roleLimitsStr) : {}
    
    const finalLimits = {
      emperor: EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.emperor,
      duke: customLimits.duke ?? EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.duke,
      knight: customLimits.knight ?? EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.knight,
      civilian: EMAIL_CONFIG.DEFAULT_DAILY_SEND_LIMITS.civilian,
    }

    if (userRoleNames.includes("emperor")) {
      return finalLimits.emperor
    } else if (userRoleNames.includes("duke")) {
      return finalLimits.duke
    } else if (userRoleNames.includes("knight")) {
      return finalLimits.knight
    } else if (userRoleNames.includes("civilian")) {
      return finalLimits.civilian
    }

    return -1
  } catch (error) {
    console.error('获取用户每日限制失败:', error)
    return -1
  }
}