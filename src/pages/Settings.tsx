import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Moon,
  Sun,
  Monitor,
  Globe,
  BrainCircuit,
  Target,
  Bell,
  Save,
  Loader2,
} from "lucide-react";

export default function SettingsPage() {
  const { isAuthenticated } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.settings.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      toast.success("设置已保存");
    },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    theme: "dark" as "light" | "dark" | "system",
    language: "zh-CN",
    aiModel: "kimi",
    aiApiKey: "",
    aiApiEndpoint: "",
    fileServerUrl: "",
    dailyGoal: 120,
    weekGoal: 600,
    notifications: true,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        theme: (settings.theme as "light" | "dark" | "system") || "dark",
        language: settings.language || "zh-CN",
        aiModel: settings.aiModel || "kimi",
        aiApiKey: settings.aiApiKey || "",
        aiApiEndpoint: settings.aiApiEndpoint || "",
        fileServerUrl: settings.fileServerUrl || "",
        dailyGoal: settings.dailyGoal || 120,
        weekGoal: settings.weekGoal || 600,
        notifications: settings.notifications ?? true,
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(form);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* 头部 */}
      <div>
        <h1 className="text-2xl font-bold glow-text">系统设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          自定义你的学习评估系统
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 外观设置 */}
          <Card className="glass glow-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                外观
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">主题</label>
                <div className="flex gap-3">
                  {[
                    { value: "light" as const, label: "浅色", icon: Sun },
                    { value: "dark" as const, label: "深色", icon: Moon },
                    { value: "system" as const, label: "跟随系统", icon: Monitor },
                  ].map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
                          form.theme === option.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-secondary"
                        }`}
                        onClick={() => setForm({ ...form, theme: option.value })}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-sm">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  语言
                </label>
                <div className="flex gap-3">
                  {[
                    { value: "zh-CN", label: "简体中文" },
                    { value: "en-US", label: "English" },
                  ].map((lang) => (
                    <button
                      key={lang.value}
                      className={`px-4 py-2 rounded-lg border transition-all text-sm ${
                        form.language === lang.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-secondary"
                      }`}
                      onClick={() => setForm({ ...form, language: lang.value })}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI设置 */}
          <Card className="glass glow-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-primary" />
                AI 配置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">AI 模型</label>
                <div className="flex gap-3">
                  {[
                    { value: "kimi", label: "Kimi" },
                    { value: "custom", label: "自定义" },
                  ].map((model) => (
                    <button
                      key={model.value}
                      className={`px-4 py-2 rounded-lg border transition-all text-sm ${
                        (model.value === "custom" ? form.aiModel !== "kimi" : form.aiModel === model.value)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-secondary"
                      }`}
                      onClick={() => setForm({ ...form, aiModel: model.value === "custom" ? "gpt-4o" : "kimi" })}
                    >
                      {model.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.aiModel !== "kimi" && (
                <div className="space-y-3 p-3 rounded-lg bg-secondary/30 border border-border">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">模型名称</label>
                    <Input
                      placeholder="如 gpt-4o / deepseek-v4-pro"
                      value={form.aiModel}
                      onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API 端点</label>
                    <Input
                      placeholder="https://api.openai.com/v1"
                      value={form.aiApiEndpoint}
                      onChange={(e) => setForm({ ...form, aiApiEndpoint: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key</label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={form.aiApiKey}
                      onChange={(e) => setForm({ ...form, aiApiKey: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  文件上传服务器地址
                </label>
                <Input
                  placeholder="http://你的VPS_IP:3001（用于文档识别上传）"
                  value={form.fileServerUrl}
                  onChange={(e) => setForm({ ...form, fileServerUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  配置后，文档识别功能会将文件上传到此服务器并获取公网URL供AI读取。未配置时可在识别面板手动粘贴URL。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 学习目标 */}
          <Card className="glass glow-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                学习目标
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">每日目标（分钟）</label>
                  <Input
                    type="number"
                    min={10}
                    value={form.dailyGoal}
                    onChange={(e) =>
                      setForm({ ...form, dailyGoal: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">每周目标（分钟）</label>
                  <Input
                    type="number"
                    min={60}
                    value={form.weekGoal}
                    onChange={(e) =>
                      setForm({ ...form, weekGoal: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 通知设置 */}
          <Card className="glass glow-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                通知
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">启用通知</p>
                  <p className="text-xs text-muted-foreground">
                    接收学习提醒和AI分析完成通知
                  </p>
                </div>
                <Switch
                  checked={form.notifications}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, notifications: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* 保存按钮 */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={updateSettings.isPending}
              className="gap-2"
              size="lg"
            >
              {updateSettings.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              <Save className="h-4 w-4" />
              保存设置
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
