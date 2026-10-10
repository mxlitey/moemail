import { z } from "zod"

/**
 * 恢复邮箱字段：非必填。
 * 留空（空字符串）视作"未设置"，由调用方统一归一化为 null。
 */
export const recoveryEmailField = z
  .string()
  .trim()
  .email("邮箱格式不正确")
  .max(254, "邮箱长度过长")
  .optional()
  .or(z.literal(""))

export const authSchema = z.object({
  username: z.string()
    .min(1, "用户名不能为空")
    .max(20, "用户名不能超过20个字符")
    .regex(/^[a-zA-Z0-9_-]+$/, "用户名只能包含字母、数字、下划线和横杠")
    .refine(val => !val.includes('@'), "用户名不能是邮箱格式"),
  password: z.string()
    .min(8, "密码长度必须大于等于8位"),
  recoveryEmail: recoveryEmailField,
  turnstileToken: z.string().optional()
})

export type AuthSchema = z.infer<typeof authSchema>

/** 个人中心绑定/换绑恢复邮箱（留空表示解绑） */
export const bindRecoveryEmailSchema = z.object({
  recoveryEmail: recoveryEmailField,
})

/** 忘记密码：允许用用户名或恢复邮箱作为身份标识 */
export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1, "请输入用户名或邮箱"),
})

/** 重置密码 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "重置链接无效"),
  password: z.string().min(8, "密码长度必须大于等于8位"),
})

/**
 * 将恢复邮箱归一化：去除首尾空白、转小写，空值返回 null。
 * 统一小写可保证唯一索引去重行为一致。
 */
export function normalizeRecoveryEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}