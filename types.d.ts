/// <reference types="@cloudflare/workers-types" />


declare global {
  interface CloudflareEnv {
    DB: D1Database;
    SITE_CONFIG: KVNamespace;
  }

  interface Window {
    turnstile?: {
      render: (element: HTMLElement | string, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
    }
  }

  type Env = CloudflareEnv
}

declare module "next-auth" {
  interface User {
    roles?: { name: string }[]
    username?: string | null
    providers?: string[]
    /** 是否设置了密码（用户名/密码注册用户为 true），用于展示修改密码入口 */
    hasPassword?: boolean
  }

  interface Session {
    user: User
  }
}

export type { Env }
