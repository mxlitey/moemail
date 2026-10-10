import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import {
  NOTIFICATION_CONTENT_MAX_LENGTH,
  NOTIFICATION_SUBJECT_MAX_LENGTH,
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATE_TYPES,
} from "@/config"
import type { NotificationTemplateType } from "@/config"

export const runtime = "edge"

type TemplateInput = { subject?: string; content?: string }

/** 校验错误提示用的中文名称（服务端错误信息，不随站点语言变化） */
const TYPE_LABELS: Record<NotificationTemplateType, string> = {
  welcome: "欢迎消息",
  roleChange: "角色变更通知",
  passwordReset: "密码重置通知",
  quotaChange: "发件配额调整通知",
  domainChanged: "域名变更通知",
}

function isTemplateType(value: string): value is NotificationTemplateType {
  return (NOTIFICATION_TEMPLATE_TYPES as readonly string[]).includes(value)
}

/** 读取消息中心配置：全部系统通知文案模板（返回原始值，留空表示使用内置默认） */
export async function GET() {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const env = getRequestContext().env
    const entries = await Promise.all(
      NOTIFICATION_TEMPLATE_TYPES.map(async (type) => {
        const { subjectKey, contentKey } = NOTIFICATION_TEMPLATES[type]
        const [subject, content] = await Promise.all([
          env.SITE_CONFIG.get(subjectKey),
          env.SITE_CONFIG.get(contentKey),
        ])
        return [type, { subject: subject || "", content: content || "" }] as const
      })
    )

    return NextResponse.json({ templates: Object.fromEntries(entries) })
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
    const body = (await request.json()) as { templates?: Record<string, TemplateInput> }
    const templates = body.templates ?? {}

    // 一次可保存一类或多类模板，逐类校验后统一写入
    const puts: { key: string; value: string }[] = []

    for (const [type, value] of Object.entries(templates)) {
      if (!isTemplateType(type)) continue

      const definition = NOTIFICATION_TEMPLATES[type]
      // 留空表示回退到内置默认文案，因此允许为空字符串；仅限制上限
      const subject = (value?.subject ?? "").trim()
      const content = (value?.content ?? "").trim()

      if (subject.length > NOTIFICATION_SUBJECT_MAX_LENGTH) {
        return NextResponse.json(
          { error: `${TYPE_LABELS[type]}标题不能超过 ${NOTIFICATION_SUBJECT_MAX_LENGTH} 个字符` },
          { status: 400 }
        )
      }

      if (content.length > NOTIFICATION_CONTENT_MAX_LENGTH) {
        return NextResponse.json(
          { error: `${TYPE_LABELS[type]}内容不能超过 ${NOTIFICATION_CONTENT_MAX_LENGTH} 个字符` },
          { status: 400 }
        )
      }

      puts.push({ key: definition.subjectKey, value: subject })
      puts.push({ key: definition.contentKey, value: content })
    }

    const env = getRequestContext().env
    await Promise.all(puts.map(({ key, value }) => env.SITE_CONFIG.put(key, value)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save message center config:", error)
    return NextResponse.json({ error: "保存消息中心配置失败" }, { status: 500 })
  }
}