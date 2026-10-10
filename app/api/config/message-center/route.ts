import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { checkPermission } from "@/lib/auth"
import { PERMISSIONS } from "@/lib/permissions"
import { listResendDomains } from "@/lib/system-email"
import {
  NOTIFICATION_CONTENT_MAX_LENGTH,
  NOTIFICATION_EMAIL_CONTENT_MAX_LENGTH,
  NOTIFICATION_EMAIL_FROM_KEY,
  NOTIFICATION_EMAIL_SUBJECT_MAX_LENGTH,
  NOTIFICATION_EMAIL_TEMPLATES,
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

/** 读取通知邮件配置：站内系统通知模板 + 发件地址 + 通知邮件模板（原始值，留空表示使用内置默认） */
export async function GET() {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const env = getRequestContext().env

    const templateEntries = await Promise.all(
      NOTIFICATION_TEMPLATE_TYPES.map(async (type) => {
        const { subjectKey, contentKey } = NOTIFICATION_TEMPLATES[type]
        const [subject, content] = await Promise.all([
          env.SITE_CONFIG.get(subjectKey),
          env.SITE_CONFIG.get(contentKey),
        ])
        return [type, { subject: subject || "", content: content || "" }] as const
      })
    )

    const resetEmailKeys = NOTIFICATION_EMAIL_TEMPLATES.resetPasswordEmail

    const [sender, resetEmailSubject, resetEmailContent, domains] = await Promise.all([
      env.SITE_CONFIG.get(NOTIFICATION_EMAIL_FROM_KEY),
      env.SITE_CONFIG.get(resetEmailKeys.subjectKey),
      env.SITE_CONFIG.get(resetEmailKeys.contentKey),
      listResendDomains(env.SITE_CONFIG),
    ])

    return NextResponse.json({
      templates: Object.fromEntries(templateEntries),
      sender: sender || "",
      emailTemplate: {
        subject: resetEmailSubject || "",
        content: resetEmailContent || "",
      },
      domains,
    })
  } catch (error) {
    console.error("Failed to get notification config:", error)
    return NextResponse.json({ error: "获取通知邮件配置失败" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const canAccess = await checkPermission(PERMISSIONS.MANAGE_CONFIG)

  if (!canAccess) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 })
  }

  try {
    const body = (await request.json()) as {
      templates?: Record<string, TemplateInput>
      sender?: string
      emailTemplate?: TemplateInput
    }

    const env = getRequestContext().env

    // 一次可保存一类或多类内容，逐项校验后统一写入
    const puts: { key: string; value: string }[] = []

    for (const [type, value] of Object.entries(body.templates ?? {})) {
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

    // 发件地址：留空表示清除配置，非空则必须是已配置 API Key 的域名
    if (typeof body.sender === "string") {
      const sender = body.sender.trim()

      if (sender) {
        if (!/^[^\s@]+@[^\s@]+$/.test(sender)) {
          return NextResponse.json({ error: "请输入有效的发件地址" }, { status: 400 })
        }

        const domain = sender.slice(sender.lastIndexOf("@") + 1)
        const domains = await listResendDomains(env.SITE_CONFIG)
        if (!domains.includes(domain)) {
          return NextResponse.json(
            { error: `域名 ${domain} 尚未配置 Resend API Key` },
            { status: 400 }
          )
        }
      }

      puts.push({ key: NOTIFICATION_EMAIL_FROM_KEY, value: sender })
    }

    if (body.emailTemplate) {
      const definition = NOTIFICATION_EMAIL_TEMPLATES.resetPasswordEmail
      // 留空表示回退到内置默认模板，因此允许为空字符串；仅限制上限
      const subject = (body.emailTemplate.subject ?? "").trim()
      const content = (body.emailTemplate.content ?? "").trim()

      if (subject.length > NOTIFICATION_EMAIL_SUBJECT_MAX_LENGTH) {
        return NextResponse.json(
          {
            error: `重置密码邮件标题不能超过 ${NOTIFICATION_EMAIL_SUBJECT_MAX_LENGTH} 个字符`,
          },
          { status: 400 }
        )
      }

      if (content.length > NOTIFICATION_EMAIL_CONTENT_MAX_LENGTH) {
        return NextResponse.json(
          {
            error: `重置密码邮件正文不能超过 ${NOTIFICATION_EMAIL_CONTENT_MAX_LENGTH} 个字符`,
          },
          { status: 400 }
        )
      }

      puts.push({ key: definition.subjectKey, value: subject })
      puts.push({ key: definition.contentKey, value: content })
    }

    await Promise.all(puts.map(({ key, value }) => env.SITE_CONFIG.put(key, value)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save notification config:", error)
    return NextResponse.json({ error: "保存通知邮件配置失败" }, { status: 500 })
  }
}