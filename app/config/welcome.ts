/**
 * 系统消息文案模板。
 *
 * 这里只放常量与纯函数，不引入任何运行时依赖，
 * 以便同时被服务端（system-inbox、各类通知发送点、广播 API）与客户端配置面板引用。
 *
 * 目前有两类消费方：
 *  1. 各类系统通知的标题/正文模板——见 NOTIFICATION_TEMPLATES
 *  2. 管理员广播——标题与正文同样支持占位符
 */

/**
 * 全部可配置的系统通知文案类型。
 * 注意：管理员广播不在此列，它在发送面板中即时编辑，不落库为模板。
 */
export const NOTIFICATION_TEMPLATE_TYPES = [
  "welcome",
  "roleChange",
  "passwordReset",
  "quotaChange",
  "domainChanged",
] as const

export type NotificationTemplateType = (typeof NOTIFICATION_TEMPLATE_TYPES)[number]

type NotificationTemplateDefinition = {
  /** 内置默认标题，管理员未配置（或配置为空白）时回退到此值 */
  defaultSubject: string
  /** 内置默认正文 */
  defaultContent: string
  /** 标题在 KV 中的存储键 */
  subjectKey: string
  /** 正文在 KV 中的存储键 */
  contentKey: string
  /** 该类型额外支持的占位符（不含通用占位符，见 MESSAGE_PLACEHOLDERS） */
  extraPlaceholders: readonly string[]
}

export const NOTIFICATION_TEMPLATES: Record<
  NotificationTemplateType,
  NotificationTemplateDefinition
> = {
  welcome: {
    defaultSubject: "欢迎使用 MoeMail",
    defaultContent:
      "您的消息中心已开通，系统通知（角色变更、密码重置、配额调整、邮箱过期等）会汇总到这里。",
    subjectKey: "WELCOME_SUBJECT",
    contentKey: "WELCOME_CONTENT",
    extraPlaceholders: [],
  },
  roleChange: {
    defaultSubject: "您的角色已变更",
    defaultContent:
      "您的角色已从「{oldRole}」变更为「{newRole}」，发件配额等权限会随之变化。",
    subjectKey: "NOTIFY_ROLE_CHANGE_SUBJECT",
    contentKey: "NOTIFY_ROLE_CHANGE_CONTENT",
    extraPlaceholders: ["oldRole", "newRole"],
  },
  passwordReset: {
    defaultSubject: "您的密码已被重置",
    defaultContent: "您的账户密码已被管理员重置。如非本人操作，请尽快联系管理员。",
    subjectKey: "NOTIFY_PASSWORD_RESET_SUBJECT",
    contentKey: "NOTIFY_PASSWORD_RESET_CONTENT",
    extraPlaceholders: [],
  },
  quotaChange: {
    defaultSubject: "您的发件配额已调整",
    defaultContent: "您的每日发件配额已从 {fromLimit} 封调整为 {toLimit} 封。",
    subjectKey: "NOTIFY_QUOTA_CHANGE_SUBJECT",
    contentKey: "NOTIFY_QUOTA_CHANGE_CONTENT",
    extraPlaceholders: ["fromLimit", "toLimit"],
  },
  domainChanged: {
    defaultSubject: "收件箱域名已变更",
    defaultContent: "以下邮箱所在域名已从可用域名中移除，可能无法继续接收邮件：\n{addresses}",
    subjectKey: "NOTIFY_DOMAIN_CHANGED_SUBJECT",
    contentKey: "NOTIFY_DOMAIN_CHANGED_CONTENT",
    extraPlaceholders: ["addresses"],
  },
}

/** 标题与内容各自允许的长度上限 */
export const NOTIFICATION_SUBJECT_MAX_LENGTH = 200
export const NOTIFICATION_CONTENT_MAX_LENGTH = 2000

/**
 * 支持的全部通用占位符，需与 renderMessageTemplate 中的取值保持一致。
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

/** 某类通知可用的全部占位符（通用 + 专属） */
export function getNotificationPlaceholders(type: NotificationTemplateType): string[] {
  return [...MESSAGE_PLACEHOLDERS, ...NOTIFICATION_TEMPLATES[type].extraPlaceholders]
}

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
 *
 * extras 用于传入通用上下文之外的专属占位符（如 oldRole / newRole）。
 */
export function renderMessageTemplate(
  template: string,
  ctx: PlaceholderContext,
  extras: Record<string, string> = {}
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
    ...extras,
  }

  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] : match
  )
}

/** 将管理员配置的文案归一化为可用模板，留空时回退到内置默认值 */
export function resolveNotificationTemplate(
  type: NotificationTemplateType,
  subject: string | null | undefined,
  content: string | null | undefined
): { subject: string; content: string } {
  const definition = NOTIFICATION_TEMPLATES[type]
  return {
    subject: subject?.trim() || definition.defaultSubject,
    content: content?.trim() || definition.defaultContent,
  }
}