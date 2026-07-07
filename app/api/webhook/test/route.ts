import { callWebhook, SAMPLE_MESSAGE } from "@/lib/webhook"
import { WEBHOOK_CONFIG } from "@/config"
import { z } from "zod"

export const runtime = "edge"

const testSchema = z.object({
  url: z.string().url()
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { url } = testSchema.parse(body)

    await callWebhook(url, {
      event: WEBHOOK_CONFIG.EVENTS.NEW_MESSAGE,
      data: SAMPLE_MESSAGE
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to test webhook:", error)
    return Response.json(
      { error: "Failed to test webhook" },
      { status: 400 }
    )
  }
}
