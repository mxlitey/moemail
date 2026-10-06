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

/**
 * 支持的全部占位符，需与 renderMessageTemplate 中的取值保持一致。
 * 注意 role / maxEmails / sendLimit 的呈现文案为固定中文，不随站点语言变化。
 */
export const MESSAGE_PLACEHOLDERS = [
  "username",
  "name",
  "email",
  "userId",
  "role",
  "maxEmails",
  "sendLimit",
  "adminContact",
] as const

export type PlaceholderContext = {
  userId: string
  username?: string | null
  name?: string | null
  email?: string | null
  /** 角色标识：emperor / duke / knight / civilian */
  role?: string | null
  /** 可创建邮箱上限，"unlimited" 表示不受限（皇帝） */
  maxEmails?: number | "unlimited"
  /** 每日发件上限，"unlimited" 表示无限，"disabled" 表示发件服务未启用 */
  sendLimit?: number | "unlimited" | "disabled"
  /** 站点管理员联系方式，来自站点配置 ADMIN_CONTACT */
  adminContact?: string | null
}

/** 角色标识 → 中文显示名 */
const ROLE_LABELS_ZH: Record<string, string> = {
  emperor: "皇帝",
  duke: "公爵",
  knight: "骑士",
  civilian: "平民",
}

/** 上限值的人类可读形式 */
function formatMaxEmails(value: PlaceholderContext["maxEmails"]): string {
  if (value === undefined) return ""
  if (value === "unlimited") return "无限"
  return String(value)
}

/**
 * 发件上限的人类可读形式。
 * 遵循配置里的既有约定：0 表示无限，-1 表示禁止发送（此处显示为 0）。
 */
function formatSendLimit(value: PlaceholderContext["sendLimit"]): string {
  if (value === undefined) return ""
  if (value === "disabled") return "未启用"
  if (value === "unlimited") return "无限"
  if (value === 0) return "无限"
  if (value === -1) return "0"
  return String(value)
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
    role: ctx.role ? ROLE_LABELS_ZH[ctx.role] ?? ctx.role : "",
    maxEmails: formatMaxEmails(ctx.maxEmails),
    sendLimit: formatSendLimit(ctx.sendLimit),
    adminContact: ctx.adminContact ?? "",
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