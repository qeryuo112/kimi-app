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
  Lock,
} from "lucide-react";

export default function SettingsPage() {
  const { isAuthenticated, user } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });
  const isAdmin = user?.role === "admin";

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
    aiModel: "glm-4.6v",
    aiApiKey: "",
    aiApiEndpoint: "",
    fileServerUrl: "",
    aiMaxTokens: 128000,
    aiEnableThinking: true,
    aiTemperature: 0.5,
    dailyGoal: 120,
    weekGoal: 600,
    notifications: true,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        theme: (settings.theme as "light" | "dark" | "system") || "dark",
        language: settings.language || "zh-CN",
        aiModel: settings.aiModel || "glm-4.6v",
        aiApiKey: settings.aiApiKey || "",
        aiApiEndpoint: settings.aiApiEndpoint || "",
        fileServerUrl: settings.fileServerUrl || "",
        aiMaxTokens: settings.aiMaxTokens || 128000,
        aiEnableThinking: settings.aiEnableThinking ?? true,
        aiTemperature: settings.aiTemperature ?? 0.5,
        dailyGoal: settings.dailyGoal || 120,
        weekGoal: settings.weekGoal || 600,
        notifications: settings.notifications ?? true,
      });
    }
  }, [settings]);

  const [pwdForm, setPwdForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("密码修改成功，请重新登录");
      setPwdForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (err) => toast.error(err.message || "修改失败"),
  });

  const handleSave = () => {
    updateSettings.mutate(form);
  };

  const handleChangePassword = () => {
    if (!pwdForm.oldPassword || !pwdForm.newPassword) {
      toast.error("请填写完整");
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      toast.error("两次新密码不一致");
      return;
    }
    if (pwdForm.newPassword.length < 6) {
      toast.error("新密码至少6位");
      return;
    }
    changePassword.mutate({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    });
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
              <div className="space-y-3 p-3 rounded-lg bg-secondary/30 border border-border">
                <div className="space-y-2">
                  <label className="text-sm font-medium">模型名称</label>
                  <Input
                    placeholder="如 glm-4.6v / glm-4-plus / gpt-4o"
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

              <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <label className="text-sm font-medium flex items-center gap-2">
                  文件上传服务器地址
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">全局</span>
                  {!isAdmin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">仅管理员可编辑</span>
                  )}
                </label>
                <Input
                  placeholder="http://你的VPS_IP:3001（用于文档识别上传）"
                  value={form.fileServerUrl}
                  onChange={(e) => setForm({ ...form, fileServerUrl: e.target.value })}
                  disabled={!isAdmin}
                  className={!isAdmin ? "bg-muted cursor-not-allowed" : ""}
                />
                <p className="text-xs text-muted-foreground">
                  全账号通用配置。配置后，所有用户的文档识别功能都会将文件上传到此服务器。未配置时可在识别面板手动粘贴URL。
                </p>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <label className="text-sm font-medium flex items-center gap-2">
                  AI Max Tokens
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">全局</span>
                  {!isAdmin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">仅管理员可编辑</span>
                  )}
                </label>
                <Input
                  type="number"
                  min={1}
                  placeholder="128000"
                  value={form.aiMaxTokens}
                  onChange={(e) => setForm({ ...form, aiMaxTokens: Number(e.target.value) })}
                  disabled={!isAdmin}
                  className={!isAdmin ? "bg-muted cursor-not-allowed" : ""}
                />
                <p className="text-xs text-muted-foreground">
                  全账号通用配置。控制 AI 单次输出的最大 token 数，根据模型能力调整（如 glm-4.6v 默认 128000）。
                </p>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <label className="text-sm font-medium flex items-center gap-2">
                  AI 思考模式
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">全局</span>
                  {!isAdmin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">仅管理员可编辑</span>
                  )}
                </label>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">启用思考模式</p>
                    <p className="text-xs text-muted-foreground">
                      开启后 AI 会先输出思考过程再生成结果。思考过程会占用大量 token，容易导致输出被截断。
                    </p>
                  </div>
                  <Switch
                    checked={form.aiEnableThinking}
                    onCheckedChange={(checked) => setForm({ ...form, aiEnableThinking: checked })}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <label className="text-sm font-medium flex items-center gap-2">
                  AI 温度
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">全局</span>
                  {!isAdmin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">仅管理员可编辑</span>
                  )}
                </label>
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  placeholder="0.5"
                  value={form.aiTemperature}
                  onChange={(e) => setForm({ ...form, aiTemperature: Number(e.target.value) })}
                  disabled={!isAdmin}
                  className={!isAdmin ? "bg-muted cursor-not-allowed" : ""}
                />
                <p className="text-xs text-muted-foreground">
                  全账号通用配置。温度越低输出越确定严谨（适合知识提取），越高越创造性（适合对话）。推荐范围 0.2~0.7。
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

          {/* 账号安全 */}
          <Card className="glass glow-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                账号安全
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">原密码</label>
                <Input
                  type="password"
                  placeholder="请输入当前密码"
                  value={pwdForm.oldPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, oldPassword: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">新密码</label>
                <Input
                  type="password"
                  placeholder="至少6位"
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">确认新密码</label>
                <Input
                  type="password"
                  placeholder="再次输入新密码"
                  value={pwdForm.confirmPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleChangePassword}
                  disabled={changePassword.isPending}
                  variant="outline"
                >
                  {changePassword.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  修改密码
                </Button>
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
