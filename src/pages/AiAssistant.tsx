import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Loader2,
  User,
  Bot,
  Trash2,
  Sparkles,
  BookOpen,
  Zap,
  BrainCircuit,
  Lightbulb,
  Paperclip,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

const quickActions = [
  { label: "分析我的学习数据", icon: BrainCircuit },
  { label: "生成学习计划", icon: BookOpen },
  { label: "评估当前技能", icon: Zap },
  { label: "学习建议", icon: Lightbulb },
];

export default function AiAssistant() {
  const { isAuthenticated } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  const sessionId = "default-session";
  const utils = trpc.useUtils();
  const { data: conversation } = trpc.ai.getConversation.useQuery(
    { sessionId },
    { enabled: isAuthenticated }
  );

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: () => {
      utils.ai.getConversation.invalidate();
      setIsTyping(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setIsTyping(false);
    },
  });

  const clearMutation = trpc.ai.clearConversation.useMutation({
    onSuccess: () => {
      utils.ai.getConversation.invalidate();
      toast.success("对话已清除");
    },
  });

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ url: string; name: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: settings } = trpc.settings.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, isTyping]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileServerUrl = settings?.fileServerUrl?.trim();
    if (!fileServerUrl) {
      toast.error("请先在设置中配置文件上传服务器地址");
      return;
    }

    setIsUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(`${fileServerUrl.replace(/\/$/, "")}/upload`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(`上传失败: ${err.error || res.statusText}`);
          continue;
        }
        const data = await res.json();
        if (data.url) {
          setAttachedFiles((prev) => [...prev, { url: data.url, name: file.name }]);
          toast.success(`${file.name} 上传成功`);
        }
      } catch (err: any) {
        toast.error(`上传失败: ${err.message}`);
      }
    }
    setIsUploading(false);
    e.target.value = "";
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if (!input.trim() && attachedFiles.length === 0) return;
    setIsTyping(true);
    chatMutation.mutate({
      sessionId,
      message: input,
      contextType: "general",
      fileUrls: attachedFiles.map((f) => f.url),
    });
    setInput("");
    setAttachedFiles([]);
  };

  const handleQuickAction = (label: string) => {
    setIsTyping(true);
    chatMutation.mutate({
      sessionId,
      message: label,
      contextType: "general",
    });
  };

  const messages: Message[] = conversation
    ? conversation.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: new Date(m.createdAt),
      }))
    : [];

  return (
    <div className="flex flex-col h-[calc(100vh-0px)]">
      {/* 头部 */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center animate-pulse-glow">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold flex items-center gap-2">
              AI 学习助手
              <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                在线
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              智能分析学习数据，提供个性化建议
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (confirm("确定清除所有对话记录？")) {
              clearMutation.mutate({ sessionId });
            }
          }}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          清除对话
        </Button>
      </div>

      {/* 聊天区域 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="p-4 space-y-4 max-w-4xl mx-auto">
            {messages.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 animate-float">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-2">你好！我是你的AI学习助手</h2>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                  我可以帮你分析学习情况、生成知识树、制定学习计划、评估技能水平。
                  也可以直接让我操作你的学习数据。
                </p>
                <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.label}
                        className="flex items-center gap-2 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
                        onClick={() => handleQuickAction(action.label)}
                      >
                        <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-sm">{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      msg.role === "user"
                        ? "bg-secondary"
                        : "bg-primary/20"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <Card
                    className={`max-w-[80%] ${
                      msg.role === "user"
                        ? "bg-primary/10 border-primary/20"
                        : "glass border-border/50"
                    }`}
                  >
                    <CardContent className="p-3">
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2">
                        {msg.createdAt.toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))
            )}

            {isTyping && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <Card className="glass border-border/50">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      AI思考中...
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* 输入区域 */}
        <div className="p-4 border-t border-border bg-card/50">
          <div className="max-w-4xl mx-auto">
            {/* 已上传文件列表 */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 bg-secondary/50 rounded-md px-2 py-1 text-xs"
                  >
                    <span className="truncate max-w-[200px]">{file.name}</span>
                    <button
                      onClick={() => removeAttachedFile(idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                className="hidden"
                id="ai-file-upload"
              />
              <label htmlFor="ai-file-upload">
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  disabled={isUploading}
                  asChild
                >
                  <span>
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </span>
                </Button>
              </label>
              <Input
                placeholder="输入消息，AI可以帮你分析数据、生成计划、评估能力..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={(!input.trim() && attachedFiles.length === 0) || chatMutation.isPending}
                className="gap-2 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            AI可以访问你的学习数据并进行动态修改
          </p>
        </div>
      </div>
    </div>
  );
}
