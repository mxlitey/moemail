/**
 * 系统消息文案模板。
 *
 * 这里只放常量与纯函数，不引入任何运行时依赖，
 * 以便同时被服务端（system-inbox、广播 API）与客户端配置面板引用。
 *
 * 目前有两类消费方：
 *  1. 欢迎消息（系统收件箱首次开通时写入）——见 DEFAULT_WELCOME_TEMPLATE / resolveWelcomeTemplate
 *  2. 管理员广播——标题与正文同样支持占位符
 */

/** 欢迎文案的内置默认值，管理员未配置（或配置为空白）时回退到此值 */
export const DEFAULT_WELCOME_TEMPLATE = {
  subject: "欢迎使用 MoeMail",
  content: "您的消息中心已开通，系统通知（角色变更、密码重置、配额调整、邮箱过期等）会汇总到这里。",
} as const

/** 管理员配置欢迎文案使用的 KV 键 */
export const WELCOME_SUBJECT_KEY = "WELCOME_SUBJECT"
export const WELCOME_CONTENT_KEY = "WELCOME_CONTENT"

/** 欢迎文案标题与内容各自允许的长度上限 */
export const WELCOME_SUBJECT_MAX_LENGTH = 200
export const WELCOME_CONTENT_MAX_LENGTH = 2000

/** 文案支持的全部占位符，需与 renderMessageTemplate 中的取值保持一致 */
export const MESSAGE_PLACEHOLDERS = ["username", "name", "email", "userId"] as const

export type PlaceholderContext = {
  userId: string
  username?: string | null
  name?: string | null
  email?: string | null
}

/**
 * 替换文案中的占位符。仅替换白名单内的键，
 * 未定义的占位符原样保留，便于管理员从呈现结果直接发现拼写错误。
 */
export function renderMessageTemplate(
  template: string,
  ctx: PlaceholderContext
): string {
  const values: Record<string, string> = {
    userId: ctx.userId,
    // 与 session 的展示名保持一致：没有 name 时回退到 username
    name: ctx.name || ctx.username || "",
    username: ctx.username ?? "",
    email: ctx.email ?? "",
  }

  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] : match
  )
}

/** 将管理员配置的欢迎文案归一化为可用模板，留空时回退到内置默认值 */
export function resolveWelcomeTemplate(
  subject: string | null | undefined,
  content: string | null | undefined
): { subject: string; content: string } {
  return {
    subject: subject?.trim() || DEFAULT_WELCOME_TEMPLATE.subject,
    content: content?.trim() || DEFAULT_WELCOME_TEMPLATE.content,
  }
}