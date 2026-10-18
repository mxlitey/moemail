import { NextResponse } from "next/server"
import { getUserId } from "@/lib/apiKey"
import { handleJsonRpc, listToolNames, resolveMcpUser } from "@/lib/mcp"

export const runtime = "edge"

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-API-Key, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
}

function unauthorized() {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32001,
        message:
          "未授权：请在请求头携带 X-API-Key（或在 URL 后追加 ?key=），API Key 可在个人中心创建",
      },
    },
    { status: 401, headers: CORS_HEADERS }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET() {
  // Streamable HTTP 规范：不支持服务端 SSE 推送时应返回 405，客户端会据此改用一次性 POST 响应
  return NextResponse.json(
    {
      name: "moemail-mcp",
      transport: "streamable-http",
      endpoint: "/api/mcp",
      tools: listToolNames(),
      hint: "使用 POST 发送 JSON-RPC 请求，并在请求头携带 X-API-Key 或 Authorization: Bearer <API Key>",
      error: "本端点不提供 GET SSE 流，请使用 POST",
    },
    { status: 405, headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" } }
  )
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) {
    return unauthorized()
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const ctx = await resolveMcpUser(userId)
  const { responses, hasOnlyNotifications } = await handleJsonRpc(ctx, payload as any)

  // 通知消息（如 notifications/initialized）无需响应体
  if (hasOnlyNotifications) {
    return new NextResponse(null, { status: 202, headers: CORS_HEADERS })
  }

  const body = Array.isArray(payload) ? responses : responses[0]
  const accept = request.headers.get("Accept") ?? ""

  // 仅接受 SSE 的客户端按 EventStream 返回单次事件
  if (accept.includes("text/event-stream") && !accept.includes("application/json")) {
    const stream = `event: message\ndata: ${JSON.stringify(body)}\n\n`
    return new NextResponse(stream, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    })
  }

  return NextResponse.json(body, { headers: CORS_HEADERS })
}
