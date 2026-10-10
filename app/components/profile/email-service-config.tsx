"use client"

import React, { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DomainApiKey {
  domain: string
  apiKey: string
}

interface EmailServiceConfig {
  enabled: boolean
  domainKeys: DomainApiKey[]
  roleLimits: {
    duke: number
    knight: number
  }
}

export function EmailServiceConfig() {
  const t = useTranslations("profile.emailService")
  const tCard = useTranslations("profile.card")
  const tSend = useTranslations("emails.send")
  const [config, setConfig] = useState<EmailServiceConfig>({
    enabled: false,
    domainKeys: [],
    roleLimits: {
      duke: -1,
      knight: -1,
    }
  })
  const [emailDomains, setEmailDomains] = useState<string[]>([])
  const [selectedDomain, setSelectedDomain] = useState("")
  const [loading, setLoading] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({})
  const { toast } = useToast()

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const [serviceRes, siteRes] = await Promise.all([
        fetch("/api/config/email-service"),
        fetch("/api/config")
      ])
      if (serviceRes.ok) {
        const data = await serviceRes.json() as EmailServiceConfig
        setConfig(data)
      }
      if (siteRes.ok) {
        const site = await siteRes.json() as { emailDomains: string }
        setEmailDomains(
          (site.emailDomains || "")
            .split(",")
            .map((domain) => domain.trim())
            .filter(Boolean)
        )
      }
    } catch (error) {
      console.error("Failed to fetch email service config:", error)
    }
  }

  // 已配置的域名不再出现在下拉选项中
  const configuredDomains = new Set(
    config.domainKeys.map((item) => item.domain.trim().toLowerCase())
  )
  const availableDomains = emailDomains.filter(
    (domain) => !configuredDomains.has(domain.toLowerCase())
  )

  const handleAddDomain = (domain: string) => {
    setConfig((prev: EmailServiceConfig) => ({
      ...prev,
      domainKeys: [...prev.domainKeys, { domain, apiKey: "" }]
    }))
    setSelectedDomain("")
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const saveData = {
        enabled: config.enabled,
        domainKeys: config.domainKeys,
        roleLimits: config.roleLimits
      }

      const res = await fetch("/api/config/email-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveData),
      })

      if (!res.ok) {
        const error = await res.json() as { error: string }
        throw new Error(error.error || t("saveFailed"))
      }

      toast({
        title: t("saveSuccess"),
        description: t("saveSuccess"),
      })
    } catch (error) {
      toast({
        title: t("saveFailed"),
        description: error instanceof Error ? error.message : t("saveFailed"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enabled" className="text-sm font-medium">
              {t("enable")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("enableDescription")}
            </p>
          </div>
          <Switch
            id="enabled"
            checked={config.enabled}
            onCheckedChange={(checked: boolean) =>
              setConfig((prev: EmailServiceConfig) => ({ ...prev, enabled: checked }))
            }
          />
        </div>

        {config.enabled && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">
                  {t("domainKeys")}
                </Label>
                <Select
                  value={selectedDomain}
                  onValueChange={handleAddDomain}
                  disabled={availableDomains.length === 0}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder={t("addDomain")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDomains.map((domain) => (
                      <SelectItem key={domain} value={domain}>
                        {domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("domainKeysDescription")}
              </p>
              <div className="space-y-3">
                {config.domainKeys.map((item, index) => (
                  <div key={item.domain} className="flex items-start gap-2">
                    <div className="flex h-9 flex-1 items-center rounded-md border border-input bg-muted/50 px-3 text-sm">
                      {item.domain}
                    </div>
                    <div className="relative flex-1">
                      <Input
                        type={visibleKeys[index] ? "text" : "password"}
                        value={item.apiKey}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setConfig((prev: EmailServiceConfig) => ({
                            ...prev,
                            domainKeys: prev.domainKeys.map((entry, i) =>
                              i === index ? { ...entry, apiKey: e.target.value } : entry
                            )
                          }))
                        }
                        placeholder={t("apiKeyPlaceholder")}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() =>
                          setVisibleKeys((prev) => ({ ...prev, [index]: !prev[index] }))
                        }
                      >
                        {visibleKeys[index] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("removeDomain")}
                      onClick={() =>
                        setConfig((prev: EmailServiceConfig) => ({
                          ...prev,
                          domainKeys: prev.domainKeys.filter((_, i) => i !== index)
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {config.domainKeys.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("noDomainKeys")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("roleLimits")}
              </Label>
              <div className="space-y-4">
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg text-sm">
                  <p className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    {t("fixedRoleLimits")}
                  </p>
                  <div className="space-y-2 text-blue-800">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span><strong>{tCard("roles.EMPEROR")}</strong> - {t("emperorLimit")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                      <span><strong>{tCard("roles.CIVILIAN")}</strong> - {t("civilianLimit")}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <p className="text-sm font-medium text-gray-900">{t("configRoleLabel")}</p>
                  </div>
                  {[
                    { value: "duke", label: tCard("roles.DUKE"), key: "duke" as const },
                    { value: "knight", label: tCard("roles.KNIGHT"), key: "knight" as const }
                  ].map((role) => {
                    const isDisabled = config.roleLimits[role.key] === -1
                    const isEnabled = !isDisabled
                    
                    return (
                      <div 
                        key={role.value} 
                        className={`group relative p-4 border-2 rounded-xl transition-all duration-200 ${
                          isEnabled
                            ? 'border-primary/30 bg-primary/5 shadow-sm' 
                            : 'border-gray-200 hover:border-primary/20 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="relative">
                              <Checkbox
                                id={`role-${role.value}`}
                                checked={isEnabled}
                                onChange={(checked: boolean) => {
                                  setConfig((prev: EmailServiceConfig) => ({
                                    ...prev,
                                    roleLimits: {
                                      ...prev.roleLimits,
                                      [role.key]: checked ? 0 : -1
                                    }
                                  }))
                                }}
                              />
                            </div>
                            <div>
                              <Label 
                                htmlFor={`role-${role.value}`} 
                                className="text-base font-semibold cursor-pointer select-none flex items-center gap-2"
                              >
                                <span className="text-2xl">
                                  {role.value === 'duke' ? '🏰' : '⚔️'}
                                </span>
                                {role.label}
                              </Label>
                              <p className="text-xs text-muted-foreground mt-1">
                                {isEnabled ? t("enabled") : t("disabled")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <div className="text-right">
                              <Label className="text-xs font-medium text-gray-600 block mb-1">{t("dailyLimit")}</Label>
                              <div className="flex items-center space-x-2">
                                <Input
                                  type="number"
                                  min="-1"
                                  value={config.roleLimits[role.key]}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                                    setConfig((prev: EmailServiceConfig) => ({
                                      ...prev,
                                      roleLimits: {
                                        ...prev.roleLimits,
                                        [role.key]: parseInt(e.target.value) || 0
                                      }
                                    }))
                                  }
                                  className="w-20 h-9 text-center text-sm font-medium"
                                  placeholder="0"
                                  disabled={isDisabled}
                                />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{tSend("dailyLimitUnit")}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">0 = {t("unlimited")}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        <Button 
          onClick={handleSave}
          disabled={loading}
          className="w-full"
        >
          {loading ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  )
} 