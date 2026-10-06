import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import {
  WELCOME_SUBJECT_KEY,
  WELCOME_CONTENT_KEY,
  WELCOME_SUBJECT_MAX_LENGTH,
  WELCOME_CONTENT_MAX_LENGTH,
} from "@/config"

export const runtime = "edge"

/** 读取消息中心配置（目前为欢迎消息文案） */
export async function GET() {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const env = getRequestContext().env
    const [welcomeSubject, welcomeContent] = await Promise.all([
      env.SITE_CONFIG.get(WELCOME_SUBJECT_KEY),
      env.SITE_CONFIG.get(WELCOME_CONTENT_KEY),
    ])

    // 返回原始配置（可能为空），由前端决定是否回显默认文案
    return NextResponse.json({
      welcomeSubject: welcomeSubject || "",
      welcomeContent: welcomeContent || "",
    })
  } catch (error) {
    console.error("Failed to get message center config:", error)
    return NextResponse.json({ error: "获取消息中心配置失败" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      welcomeSubject?: string
      welcomeContent?: string
    }

    // 留空表示回退到内置默认文案，因此允许为空字符串；仅限制上限
    const welcomeSubject = (body.welcomeSubject ?? "").trim()
    const welcomeContent = (body.welcomeContent ?? "").trim()

    if (welcomeSubject.length > WELCOME_SUBJECT_MAX_LENGTH) {
      return NextResponse.json(
        { error: `欢迎消息标题不能超过 ${WELCOME_SUBJECT_MAX_LENGTH} 个字符` },
        { status: 400 }
      )
    }

    if (welcomeContent.length > WELCOME_CONTENT_MAX_LENGTH) {
      return NextResponse.json(
        { error: `欢迎消息内容不能超过 ${WELCOME_CONTENT_MAX_LENGTH} 个字符` },
        { status: 400 }
      )
    }

    const env = getRequestContext().env
    await Promise.all([
      env.SITE_CONFIG.put(WELCOME_SUBJECT_KEY, welcomeSubject),
      env.SITE_CONFIG.put(WELCOME_CONTENT_KEY, welcomeContent),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save message center config:", error)
    return NextResponse.json({ error: "保存消息中心配置失败" }, { status: 500 })
  }
}