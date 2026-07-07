"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { ArrowLeft, Gem, Sword, User2, Crown, Loader2, Search, KeyRound, Trash2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { ROLES, Role } from "@/lib/permissions"

type RoleWithoutEmperor = Exclude<Role, typeof ROLES.EMPEROR>

interface UserItem {
  id: string
  name?: string | null
  username?: string | null
  email?: string | null
  role?: string
}

interface RolesManagerProps {
  currentUserId: string
}

const roleIcons = {
  [ROLES.EMPEROR]: Crown,
  [ROLES.DUKE]: Gem,
  [ROLES.KNIGHT]: Sword,
  [ROLES.CIVILIAN]: User2,
} as const

export function RolesManager({ currentUserId }: RolesManagerProps) {
  const t = useTranslations("profile.roles")
  const tCard = useTranslations("profile.card")
  const tCommon = useTranslations("common.actions")
  const tNav = useTranslations("common.nav")
  const router = useRouter()
  const locale = useLocale()
  const { toast } = useToast()

  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 10
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null)
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState<UserItem | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)

  const roleNames = {
    [ROLES.EMPEROR]: tCard("roles.EMPEROR"),
    [ROLES.DUKE]: tCard("roles.DUKE"),
    [ROLES.KNIGHT]: tCard("roles.KNIGHT"),
    [ROLES.CIVILIAN]: tCard("roles.CIVILIAN"),
  } as const

  const fetchUsers = useCallback(async (search: string, targetPage: number) => {
    try {
      const url = new URL("/api/roles/users", window.location.origin)
      if (search) {
        url.searchParams.set("search", search)
      }
      url.searchParams.set("page", String(targetPage))
      url.searchParams.set("pageSize", String(PAGE_SIZE))
      const res = await fetch(url)
      const data = await res.json() as { users?: UserItem[]; total?: number; error?: string }
      if (!res.ok) {
        throw new Error(data.error || t("fetchFailed"))
      }
      setUsers(data.users ?? [])
      setTotal(data.total ?? 0)
    } catch (error) {
      toast({
        title: t("fetchFailed"),
        description: error instanceof Error ? error.message : t("fetchFailed"),
        variant: "destructive",
      })
      setUsers([])
      setTotal(0)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [t, toast])

  // 唯一的请求 effect：依赖 page 与 debouncedSearch，搜索/翻页均通过防抖触发
  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => {
      fetchUsers(debouncedSearch, page)
    }, 300)
    return () => clearTimeout(timer)
  }, [debouncedSearch, page, fetchUsers])

  const handleRefresh = () => {
    setRefreshing(true)
    setLoading(true)
    fetchUsers(debouncedSearch, page)
  }

  const handlePageChange = (newPage: number) => {
    const target = Math.max(1, Math.min(totalPages, newPage))
    if (target === page) return
    setPage(target)
  }

  // 搜索框输入：重置到第一页，防抖由主 effect 处理
  const handleSearchChange = (value: string) => {
    setSearchText(value)
    setDebouncedSearch(value)
    setPage(1)
  }

  const handleRoleChange = async (user: UserItem, newRole: RoleWithoutEmperor) => {
    if (user.role === newRole) return

    setUpdatingRoleId(user.id)
    try {
      const res = await fetch("/api/roles/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, roleName: newRole }),
      })
      const data = await res.json() as { error?: string; success?: boolean }
      if (!res.ok) {
        throw new Error(data.error || t("updateFailed"))
      }
      setUsers(prev =>
        prev.map(u => (u.id === user.id ? { ...u, role: newRole } : u))
      )
      toast({
        title: t("updateSuccess"),
        description: `${user.username || user.email || user.id} - ${roleNames[newRole]}`,
      })
    } catch (error) {
      toast({
        title: t("updateFailed"),
        description: error instanceof Error ? error.message : t("updateFailed"),
        variant: "destructive",
      })
    } finally {
      setUpdatingRoleId(null)
    }
  }

  const handleDelete = async () => {
    if (!userToDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/roles/users/${userToDelete.id}`, {
        method: "DELETE",
      })
      const data = await res.json() as { error?: string; success?: boolean }
      if (!res.ok) {
        throw new Error(data.error || t("deleteFailed"))
      }
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id))
      setTotal(prev => Math.max(0, prev - 1))
      // 当前页删空且不在第一页时，回退到上一页（由 page effect 自动重新拉取）
      if (users.length === 1 && page > 1) {
        setPage(page - 1)
      }
      toast({
        title: t("deleteSuccess"),
        description: userToDelete.username || userToDelete.email || userToDelete.id,
      })
    } catch (error) {
      toast({
        title: t("deleteFailed"),
        description: error instanceof Error ? error.message : t("deleteFailed"),
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
      setUserToDelete(null)
    }
  }

  const handleSavePassword = async () => {
    if (!passwordTarget) return
    if (newPassword.length < 8) {
      toast({
        title: t("passwordInvalid"),
        description: t("passwordInvalidDescription"),
        variant: "destructive",
      })
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch(`/api/roles/users/${passwordTarget.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })
      const data = await res.json() as { error?: string; success?: boolean }
      if (!res.ok) {
        throw new Error(data.error || t("passwordUpdateFailed"))
      }
      toast({
        title: t("passwordUpdateSuccess"),
        description: passwordTarget.username || passwordTarget.email || passwordTarget.id,
      })
      setPasswordTarget(null)
      setNewPassword("")
    } catch (error) {
      toast({
        title: t("passwordUpdateFailed"),
        description: error instanceof Error ? error.message : t("passwordUpdateFailed"),
        variant: "destructive",
      })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-background rounded-lg border-2 border-primary/20 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t("title")}</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/${locale}/profile`)}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {tNav("backToProfile")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <div className="bg-background rounded-lg border-2 border-primary/20 p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className={refreshing ? "animate-spin" : ""}
            title={t("refresh")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">{t("loading")}</span>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            {t("noUsers")}
          </div>
        ) : (
          <>
            {/* 桌面端表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 px-3 font-medium">{t("username")}</th>
                    <th className="py-2 px-3 font-medium">{t("email")}</th>
                    <th className="py-2 px-3 font-medium">{t("role")}</th>
                    <th className="py-2 px-3 font-medium text-right">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSelf = user.id === currentUserId
                    const isEmperor = user.role === ROLES.EMPEROR
                    const isUpdating = updatingRoleId === user.id
                    const RoleIcon = roleIcons[(user.role as Role) ?? ROLES.CIVILIAN] ?? User2
                    return (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <RoleIcon className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span className="font-medium truncate max-w-[160px]">
                              {user.username || user.name || "-"}
                            </span>
                            {isSelf && (
                              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                {t("you")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-muted-foreground">
                          <span className="truncate block max-w-[200px]">
                            {user.email || "-"}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {isEmperor || isSelf ? (
                            <div className="flex items-center gap-1 text-sm">
                              <RoleIcon className="w-4 h-4 text-primary" />
                              {roleNames[(user.role as Role) ?? ROLES.CIVILIAN] ?? user.role}
                            </div>
                          ) : (
                            <Select
                              value={user.role ?? ROLES.CIVILIAN}
                              disabled={isUpdating}
                              onValueChange={(value) =>
                                handleRoleChange(user, value as RoleWithoutEmperor)
                              }
                            >
                              <SelectTrigger className="w-32 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={ROLES.DUKE}>
                                  <div className="flex items-center gap-2">
                                    <Gem className="w-4 h-4" />
                                    {roleNames[ROLES.DUKE]}
                                  </div>
                                </SelectItem>
                                <SelectItem value={ROLES.KNIGHT}>
                                  <div className="flex items-center gap-2">
                                    <Sword className="w-4 h-4" />
                                    {roleNames[ROLES.KNIGHT]}
                                  </div>
                                </SelectItem>
                                <SelectItem value={ROLES.CIVILIAN}>
                                  <div className="flex items-center gap-2">
                                    <User2 className="w-4 h-4" />
                                    {roleNames[ROLES.CIVILIAN]}
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={isEmperor || isSelf || !user.username}
                              title={t("changePassword")}
                              onClick={() => {
                                setPasswordTarget(user)
                                setNewPassword("")
                              }}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={isEmperor || isSelf}
                              title={t("delete")}
                              onClick={() => setUserToDelete(user)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片列表 */}
            <div className="md:hidden space-y-3">
              {users.map((user) => {
                const isSelf = user.id === currentUserId
                const isEmperor = user.role === ROLES.EMPEROR
                const isUpdating = updatingRoleId === user.id
                const RoleIcon = roleIcons[(user.role as Role) ?? ROLES.CIVILIAN] ?? User2
                return (
                  <div
                    key={user.id}
                    className="border rounded-lg p-3 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <RoleIcon className="w-4 h-4 text-primary/70 flex-shrink-0" />
                          <span className="font-medium truncate">
                            {user.username || user.name || "-"}
                          </span>
                          {isSelf && (
                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              {t("you")}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          {user.email || "-"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12">{t("role")}</span>
                      {isEmperor || isSelf ? (
                        <div className="flex items-center gap-1 text-sm flex-1">
                          <RoleIcon className="w-4 h-4 text-primary" />
                          {roleNames[(user.role as Role) ?? ROLES.CIVILIAN] ?? user.role}
                        </div>
                      ) : (
                        <Select
                          value={user.role ?? ROLES.CIVILIAN}
                          disabled={isUpdating}
                          onValueChange={(value) =>
                            handleRoleChange(user, value as RoleWithoutEmperor)
                          }
                        >
                          <SelectTrigger className="h-8 flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ROLES.DUKE}>
                              <div className="flex items-center gap-2">
                                <Gem className="w-4 h-4" />
                                {roleNames[ROLES.DUKE]}
                              </div>
                            </SelectItem>
                            <SelectItem value={ROLES.KNIGHT}>
                              <div className="flex items-center gap-2">
                                <Sword className="w-4 h-4" />
                                {roleNames[ROLES.KNIGHT]}
                              </div>
                            </SelectItem>
                            <SelectItem value={ROLES.CIVILIAN}>
                              <div className="flex items-center gap-2">
                                <User2 className="w-4 h-4" />
                                {roleNames[ROLES.CIVILIAN]}
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1 pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        disabled={isEmperor || isSelf || !user.username}
                        onClick={() => {
                          setPasswordTarget(user)
                          setNewPassword("")
                        }}
                      >
                        <KeyRound className="w-4 h-4" />
                        {t("changePassword")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-destructive"
                        disabled={isEmperor || isSelf}
                        onClick={() => setUserToDelete(user)}
                      >
                        <Trash2 className="w-4 h-4" />
                        {tCommon("delete")}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 分页 */}
            {total > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  {t("pagination.info", {
                    page,
                    totalPages,
                    total,
                  })}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    disabled={page <= 1 || loading}
                    onClick={() => handlePageChange(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="sr-only">{t("pagination.prev")}</span>
                  </Button>
                  <span className="text-sm px-2 tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    disabled={page >= totalPages || loading}
                    onClick={() => handlePageChange(page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                    <span className="sr-only">{t("pagination.next")}</span>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => { if (!open) setUserToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", {
                user: userToDelete?.username || userToDelete?.email || userToDelete?.id || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  {t("deleting")}
                </>
              ) : (
                tCommon("delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 修改密码对话框 */}
      <Dialog
        open={!!passwordTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordTarget(null)
            setNewPassword("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("changePasswordTitle")}</DialogTitle>
            <DialogDescription>
              {t("changePasswordDescription", {
                user: passwordTarget?.username || passwordTarget?.email || passwordTarget?.id || "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("newPasswordPlaceholder")}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordTarget(null)
                setNewPassword("")
              }}
              disabled={savingPassword}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSavePassword} disabled={savingPassword || newPassword.length < 8}>
              {savingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  {t("saving")}
                </>
              ) : (
                tCommon("save")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
