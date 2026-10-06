import { auth } from "@/lib/auth"
import { createDb } from "@/lib/db"
import { webhooks } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import {
  isForbiddenHeader,
  isValidHeaderName,
  parseHeaders,
  serializeHeaders,
} from "@/lib/webhook"

export const runtime = "edge"

const headerSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(2000),
})

const webhookSchema = z.object({
  url: z.string().url(),
  enabled: z.boolean(),
  template: z.string().max(5000).optional().nullable(),
  headers: z.array(headerSchema).max(20).optional().nullable(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = createDb()
  const webhook = await db.query.webhooks.findFirst({
    where: eq(webhooks.userId, session.user.id)
  })

  if (!webhook) {
    return Response.json({ enabled: false, url: "", template: "", headers: [] })
  }

  return Response.json({
    enabled: webhook.enabled,
    url: webhook.url,
    template: webhook.template ?? "",
    headers: parseHeaders(webhook.headers) ?? [],
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { url, enabled, template, headers } = webhookSchema.parse(body)

    // 请求头合法性校验：名称必须符合 token 规范，且不得使用受控/禁用头
    for (const header of headers ?? []) {
      if (!isValidHeaderName(header.key)) {
        return Response.json({ error: `Invalid header name: ${header.key}` }, { status: 400 })
      }
      if (isForbiddenHeader(header.key)) {
        return Response.json({ error: `Header not allowed: ${header.key}` }, { status: 400 })
      }
    }

    const db = createDb()
    const now = new Date()
    const normalizedTemplate = template && template.trim() ? template : null
    // headers 为 null 表示"未配置"，[] 表示"用户显式清空"
    const normalizedHeaders = serializeHeaders(headers ?? null)

    const existingWebhook = await db.query.webhooks.findFirst({
      where: eq(webhooks.userId, session.user.id)
    })

    if (existingWebhook) {
      await db
        .update(webhooks)
        .set({
          url,
          enabled,
          template: normalizedTemplate,
          headers: normalizedHeaders,
          updatedAt: now
        })
        .where(eq(webhooks.userId, session.user.id))
    } else {
      await db
        .insert(webhooks)
        .values({
          userId: session.user.id,
          url,
          enabled,
          template: normalizedTemplate,
          headers: normalizedHeaders,
        })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to save webhook:", error)
    return Response.json(
      { error: "Invalid request" },
      { status: 400 }
    )
  }
}