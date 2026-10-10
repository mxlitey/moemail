/**
 * 系统消息文案模板。
 *
 * 这里只放常量与纯函数，不引入任何运行时依赖，
 * 以便同时被服务端（system-inbox、各类通知发送点、广播 API）与客户端配置面板引用。
 *
 * 目前有三类消费方：
 *  1. 各类系统通知的标题/正文模板——见 NOTIFICATION_TEMPLATES
 *  2. 管理员广播——标题与正文同样支持占位符
 *  3. 通知邮件（真正投递到用户邮箱的系统邮件）——见 NOTIFICATION_EMAIL_TEMPLATES
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

/* ------------------------------------------------------------------ *
 * 通知邮件：真正通过 Resend 投递到用户邮箱的系统邮件
 * 与 NOTIFICATION_TEMPLATES（写入系统收件箱的站内消息）相互独立。
 * ------------------------------------------------------------------ */

/** 可配置的通知邮件类型 */
export type NotificationEmailType = "resetPasswordEmail"

/**
 * 通知邮件模板支持的占位符，需与调用方传入的取值保持一致。
 * 注意：HTML 正文里的内联样式不会出现花括号，因此可以与占位符语法共存。
 */
export const NOTIFICATION_EMAIL_PLACEHOLDERS = ["username", "name", "email", "link"] as const

/** 通知邮件标题与正文各自允许的长度上限 */
export const NOTIFICATION_EMAIL_SUBJECT_MAX_LENGTH = 200
export const NOTIFICATION_EMAIL_CONTENT_MAX_LENGTH = 8000

/** 通知邮件发件地址在 KV 中的存储键，取值形如 noreply@example.com */
export const NOTIFICATION_EMAIL_FROM_KEY = "NOTIFICATION_EMAIL_FROM"

type NotificationEmailTemplateDefinition = {
  /** 标题在 KV 中的存储键 */
  subjectKey: string
  /** 正文（HTML）在 KV 中的存储键 */
  contentKey: string
}

export const NOTIFICATION_EMAIL_TEMPLATES: Record<
  NotificationEmailType,
  NotificationEmailTemplateDefinition
> = {
  resetPasswordEmail: {
    subjectKey: "NOTIFY_RESET_EMAIL_SUBJECT",
    contentKey: "NOTIFY_RESET_EMAIL_CONTENT",
  },
}

type ResetEmailCopy = {
  subject: string
  title: string
  body: string
  button: string
  ignore: string
}

/**
 * 重置密码邮件的内置默认文案，按站点语言提供，未知语言回退到英文。
 * 管理员在「通知邮件」中填写自定义模板后，全部语言统一使用自定义内容。
 */
const RESET_EMAIL_COPY: Record<string, ResetEmailCopy> = {
  en: {
    subject: "Reset your MoeMail password",
    title: "Password reset",
    body: "We received a request to reset the password for your account. Click the button below to set a new password. The link expires in 30 minutes.",
    button: "Reset password",
    ignore: "If you did not request this, you can safely ignore this email.",
  },
  "zh-CN": {
    subject: "重置您的 MoeMail 密码",
    title: "重置密码",
    body: "我们收到了重置您账号密码的请求。请点击下方按钮设置新密码，链接 30 分钟内有效。",
    button: "重置密码",
    ignore: "如果这不是您本人的操作，请忽略本邮件。",
  },
  "zh-TW": {
    subject: "重設您的 MoeMail 密碼",
    title: "重設密碼",
    body: "我們收到了重設您帳號密碼的請求。請點擊下方按鈕設定新密碼，連結 30 分鐘內有效。",
    button: "重設密碼",
    ignore: "如果這不是您本人的操作，請忽略本郵件。",
  },
  ja: {
    subject: "MoeMail のパスワードをリセット",
    title: "パスワードのリセット",
    body: "アカウントのパスワードリセットのリクエストを受け付けました。下のボタンから新しいパスワードを設定してください。リンクの有効期限は 30 分です。",
    button: "パスワードをリセット",
    ignore: "心当たりがない場合は、このメールを無視してください。",
  },
  ko: {
    subject: "MoeMail 비밀번호 재설정",
    title: "비밀번호 재설정",
    body: "계정 비밀번호 재설정 요청을 받았습니다. 아래 버튼을 눌러 새 비밀번호를 설정하세요. 링크는 30분 동안 유효합니다.",
    button: "비밀번호 재설정",
    ignore: "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.",
  },
}

/** 用默认文案拼出完整 HTML 邮件；{link} 留给调用方渲染 */
function buildResetEmailHtml(copy: ResetEmailCopy): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
  <h2 style="font-size:20px;margin:0 0 16px;">${copy.title}</h2>
  <p style="font-size:14px;line-height:1.6;margin:0 0 24px;">${copy.body}</p>
  <p style="margin:0 0 24px;">
    <a href="{link}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;">${copy.button}</a>
  </p>
  <p style="font-size:12px;line-height:1.6;word-break:break-all;color:#6b7280;margin:0 0 16px;">{link}</p>
  <p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:0;">${copy.ignore}</p>
</div>`
}

/** 取某语言的重置密码邮件默认模板 */
export function getResetEmailDefault(locale: string): { subject: string; content: string } {
  const copy = RESET_EMAIL_COPY[locale] ?? RESET_EMAIL_COPY.en
  return { subject: copy.subject, content: buildResetEmailHtml(copy) }
}

/**
 * 替换通知邮件模板中的占位符。仅替换白名单内的键，
 * 未定义的占位符原样保留，便于管理员从邮件里直接发现拼写错误。
 */
export function renderNotificationEmailTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] ?? "" : match
  )
}