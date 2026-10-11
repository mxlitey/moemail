"use client"

import { useEffect, useState } from "react"
import { Moon, Sun, SunMoon } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

/** 主题循环顺序：浅色 → 深色 → 跟随系统 */
const THEME_CYCLE = ["light", "dark", "system"] as const
type ThemeName = (typeof THEME_CYCLE)[number]

function isThemeName(value: string | undefined): value is ThemeName {
  return !!value && (THEME_CYCLE as readonly string[]).includes(value)
}

export function ThemeToggle() {
  const t = useTranslations("common.theme")
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // SSR 阶段拿不到主题，挂载后再渲染图标与提示，避免服务端与客户端渲染不一致
  useEffect(() => setMounted(true), [])

  const current: ThemeName = isThemeName(theme) ? theme : "system"
  const nextTheme = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length]

  const renderIcon = () => {
    if (current === "light") return <Sun className="h-5 w-5" />
    if (current === "dark") return <Moon className="h-5 w-5" />
    // 跟随系统时固定显示半日半月图标：不随系统明暗变化，避免被误认为手动切换
    return <SunMoon className="h-5 w-5" />
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(nextTheme)}
      title={mounted ? t(current) : undefined}
      aria-label={mounted ? t(current) : undefined}
      className="rounded-full"
    >
      {mounted ? renderIcon() : <span className="h-5 w-5" />}
    </Button>
  )
}