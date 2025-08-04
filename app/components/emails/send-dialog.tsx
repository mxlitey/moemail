"use client"

import { useState, useEffect } from "react"  // 补充 useEffect 导入
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Send } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SendDialogProps {
  emailId: string
  fromAddress: string
  onSendSuccess?: () => void
}

export function SendDialog({ emailId, fromAddress, onSendSuccess }: SendDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [content, setContent] = useState("")
  const { toast } = useToast()
  // 新增配额相关状态
  const [quota, setQuota] = useState<string>("加载中...")
  const [quotaError, setQuotaError] = useState<string>("")

  // 新增：获取配额的函数
  const fetchEmailQuota = async () => {
    try {
      const response = await fetch("/api/email-limit", {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      })
      const data = await response.json()

      if (data.error) {
        setQuotaError(data.error)
        setQuota("获取失败")
        return
      }

      setQuota(data.limitDisplay)
    } catch (err) {
      console.error("获取邮件配额失败:", err)
      setQuota("获取失败")
    }
  }

  // 新增：组件挂载时获取配额
  useEffect(() => {
    fetchEmailQuota()
  }, [])

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !content.trim()) {
      toast({
        title: "错误",
        description: "收件人、主题和内容都是必填项",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/emails/${emailId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, content })
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: "错误",
          description: (data as { error: string }).error,
          variant: "destructive"
        })
        return
      }

      toast({
        title: "成功",
        description: "邮件已发送"
      })
      setOpen(false)
      setTo("")
      setSubject("")
      setContent("")
      
      onSendSuccess?.()
      fetchEmailQuota()  // 发送成功后更新配额

    } catch {
      toast({
        title: "错误",
        description: "发送邮件失败",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <DialogTrigger asChild>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="h-8 gap-2 hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">发送邮件</span>
              </Button>
            </TooltipTrigger>
          </DialogTrigger>
          <TooltipContent className="sm:hidden">
            <p>使用此邮箱发送新邮件</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            发送新邮件
            {/* 新增：显示配额信息 */}
            <span style={{ 
              marginLeft: "8px", 
              fontSize: "0.8em", 
              color: quotaError ? "#ef4444" : "#64748b"
            }}>
              (配额: {quota})
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            发件人: {fromAddress}
          </div>
          <Input
            value={to}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)}
            placeholder="收件人邮箱地址"
          />
          <Input
            value={subject}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
            placeholder="邮件主题"
          />
          <Textarea
            value={content}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
            placeholder="邮件内容"
            rows={6}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading ? "发送中..." : "发送"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}