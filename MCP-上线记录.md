# 内置云端 MCP 上线记录

日期：2026-10-19
线上地址：https://m.g8.pt/

## 本次改动

| 文件 | 说明 |
| --- | --- |
| `app/api/mcp/route.ts` | MCP 端点（JSON-RPC 2.0 / Streamable HTTP），支持 POST、OPTIONS 预检，GET 返回 405 并附带端点信息 |
| `app/lib/mcp.ts` | 协议分发与 9 个工具的具体实现 |
| `middleware.ts` | 放开 `/api/mcp` 的 OPTIONS / GET / 无 Key 请求；API Key 支持 `X-API-Key`、`Authorization: Bearer`、`?key=` 三种传递方式 |
| `app/lib/apiKey.ts` | API Key 放行路径新增 `/api/mcp` |
| `README.md` | 新增「MCP（内置云端服务）」章节与已知限制 |

## 端点信息

- 地址：`https://m.g8.pt/api/mcp`
- 传输：Streamable HTTP（服务端无 SSE 长连接，POST 一次性返回 JSON）
- 鉴权：个人中心创建的 API Key

## 工具清单

`get_config`、`create_email`、`list_emails`、`list_messages`、`read_message`、`wait_for_email`、`send_email`、`delete_message`、`delete_email`

## 接入方式

```json
{
  "mcpServers": {
    "moemail": {
      "url": "https://m.g8.pt/api/mcp",
      "headers": { "X-API-Key": "YOUR_API_KEY" }
    }
  }
}
```

只支持 URL 的客户端：

```
https://m.g8.pt/api/mcp?key=YOUR_API_KEY
```

## 验证结果（均针对线上 m.g8.pt）

| 场景 | 结果 |
| --- | --- |
| `initialize` 握手（X-API-Key） | 200，返回 protocolVersion / capabilities / serverInfo |
| `initialize` 握手（Bearer / ?key=） | 200 |
| `tools/list` | 返回 9 个工具 |
| 无 Key / 错误 Key | 401，返回协议化错误 |
| `get_config` | 正常读出域名、上限、发件开关、管理员联系方式 |
| `create_email` → `list_messages` → `delete_email` | 全链路成功 |
| `send_email` → 收件 → `list_messages` | 成功（自发自收验证） |
| `wait_for_email` 收到新邮件 | 成功返回 status=received |
| `wait_for_email` 超时 | 返回 status=timeout，可再次调用 |
| `read_message` / `delete_message` | 成功 |
| CORS 预检 OPTIONS | 204，Allow-Origin: * |
| `GET /api/mcp` | 405，附工具名提示（符合规范，客户端会改用 POST） |
| POST `/api/config` 携带 API Key | 400（即被放行到业务层并校验 body），说明未开放写配置的 MCP 工具 |

测试期间创建的临时邮箱与邮件已全部删除，未改动站点任何设置（仅读取）。

## 部署与 CI

- 提交：`1c3cc9d`（feat）、`ada7bf3`（fix + 文档）
- GitHub Actions Deploy 两次运行均 `success`，部署脚本各步骤（含 Cloudflare Pages 发布、D1 迁移、KV 同步）全部成功。

## 已知限制

- 服务端不提供 SSE 长连接，`GET` 返回 405；仅支持一次性 POST 响应。
- `wait_for_email` 单次上限 25 秒（边缘函数执行时长限制），超时后需再次调用。
- `?key=` 会把 Key 暴露在 URL 与日志中，优先用请求头。
- MCP 只暴露邮箱相关能力，不含配置修改、角色管理等写操作。

## 后续可选优化（未实施，等待确认）

1. 增加 MCP 会话 ID（`Mcp-Session-Id`）以支持有状态场景。
2. 增加 `get_message_raw`（返回原始 EML）等工具。
3. 在个人中心展示 MCP 接入地址与一键复制配置。
