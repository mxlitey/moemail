import { callWebhook, SAMPLE_MESSAGE, isForbiddenHeader, isValidHeaderName } from "@/lib/webhook"
import { WEBHOOK_CONFIG } from "@/config"
import { z } from "zod"

export const runtime = "edge"

const headerSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(2000),
})

const testSchema = z.object({
  url: z.string().url(),
  template: z.string().max(5000).optional().nullable(),
  headers: z.array(headerSchema).max(20).optional().nullable(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { url, template, headers } = testSchema.parse(body)

    for (const header of headers ?? []) {
      if (!isValidHeaderName(header.key) || isForbiddenHeader(header.key)) {
        return Response.json({ error: `Header not allowed: ${header.key}` }, { status: 400 })
      }
    }

    await callWebhook(
      url,
      {
        event: WEBHOOK_CONFIG.EVENTS.NEW_MESSAGE,
        data: SAMPLE_MESSAGE
      },
      { template, headers }
    )

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to test webhook:", error)
    return Response.json(
      { error: "Failed to test webhook" },
      { status: 400 }
    )
  }
}