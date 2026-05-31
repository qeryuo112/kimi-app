import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BrainCircuit,
  Plus,
  Clock,
  Star,
  Smile,
  Meh,
  Frown,
  Trash2,
  Flame,
  TrendingUp,
  Loader2,
  Target,
  CalendarDays,
  Sparkles,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const moodIcons: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  great: { icon: <Smile className="h-4 w-4" />, label: "很棒", color: "text-green-400" },
  good: { icon: <Smile className="h-4 w-4" />, label: "不错", color: "text-blue-400" },
  normal: { icon: <Meh className="h-4 w-4" />, label: "一般", color: "text-yellow-400" },
  tired: { icon: <Meh className="h-4 w-4" />, label: "疲惫", color: "text-orange-400" },
  bad: { icon: <Frown className="h-4 w-4" />, label: "不佳", color: "text-red-400" },
};

export default function StudyLogs() {
  const { isAuthenticated } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  const utils = trpc.useUtils();
  const { data: logs, isLoading } = trpc.study.list.useQuery(
    { limit: 50 },
    { enabled: isAuthenticated }
  );

  const { data: subjects } = trpc.subject.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: stats } = trpc.study.getStats.useQuery(
    { days: 14 },
    { enabled: isAuthenticated }
  );

  const createLog = trpc.study.create.useMutation({
    onSuccess: () => {
      utils.study.list.invalidate();
      utils.study.getStats.invalidate();
      utils.subject.list.invalidate();
      toast.success("学习记录已添加");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteLog = trpc.study.delete.useMutation({
    onSuccess: () => {
      utils.study.list.invalidate();
      utils.study.getStats.invalidate();
      toast.success("记录已删除");
    },
  });

  // AI评估学习记录
  const aiEvaluate = trpc.study.aiEvaluate.useMutation({
    onSuccess: (data) => {
      utils.study.list.invalidate();
      toast.success(`AI评估完成，质量评分: ${data.quality}/5`);
    },
    onError: (err) => toast.error(err.message),
  });

  // AI生成测试题
  const aiGenerateTests = trpc.study.aiGenerateTests.useMutation({
    onSuccess: (data) => {
      toast.success(`生成 ${data.questions.length} 道测试题`);
    },
    onError: (err) => toast.error(err.message),
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testQuestions, setTestQuestions] = useState<any[]>([]);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [testAnswers, setTestAnswers] = useState<Record<number, string>>({});
  const [testResults, setTestResults] = useState<Record<number, any>>({});
  const [showTest, setShowTest] = useState(false);
  const [form, setForm] = useState({
    subjectId: undefined as number | undefined,
    title: "",
    content: "",
    duration: 30,
    quality: 3,
    mood: "normal" as "great" | "good" | "normal" | "tired" | "bad",
    tags: "",
  });

  const resetForm = () => {
    setForm({
      subjectId: undefined,
      title: "",
      content: "",
      duration: 30,
      quality: 3,
      mood: "normal",
      tags: "",
    });
  };

  const handleCreate = () => {
    if (!form.title.trim()) {
      toast.error("请输入学习标题");
      return;
    }
    createLog.mutate(form);
  };

  // 柱状图数据
  const chartData =
    stats?.stats?.map((s) => ({
      date: s.statDate.slice(5),
      minutes: s.totalMinutes,
      sessions: s.sessionsCount,
    })) || [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold glow-text">学习记录</h1>
          <p className="text-sm text-muted-foreground mt-1">
            记录每次学习，追踪成长轨迹
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              记一笔
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                记录学习
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">学习主题 *</label>
                <Input
                  placeholder="今天学了什么？"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">关联科目</label>
                <Select
                  value={form.subjectId ? String(form.subjectId) : ""}
                  onValueChange={(v) => setForm({ ...form, subjectId: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择科目（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects?.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">时长（分钟）</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.duration}
                    onChange={(e) =>
                      setForm({ ...form, duration: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">质量 (1-5)</label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={form.quality}
                    onChange={(e) =>
                      setForm({ ...form, quality: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">心情</label>
                <div className="flex gap-2">
                  {Object.entries(moodIcons).map(([key, { icon, label, color }]) => (
                    <button
                      key={key}
                      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border transition-all ${
                        form.mood === key
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-secondary"
                      }`}
                      onClick={() => setForm({ ...form, mood: key as typeof form.mood })}
                    >
                      <span className={color}>{icon}</span>
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">笔记内容</label>
                <Textarea
                  placeholder="记录学习要点、心得..."
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreate} disabled={createLog.isPending}>
                {createLog.isPending ? "保存中..." : "保存记录"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass glow-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">总时长</p>
              <p className="text-xl font-bold">
                {Math.round((stats?.summary?.totalMinutes || 0) / 60)}h
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass glow-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Target className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">总次数</p>
              <p className="text-xl font-bold">{stats?.summary?.totalSessions || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass glow-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <Star className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">平均质量</p>
              <p className="text-xl font-bold">
                {stats?.summary?.avgQuality?.toFixed(1) || 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass glow-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Flame className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">日均(分钟)</p>
              <p className="text-xl font-bold">{stats?.summary?.avgDailyMinutes || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 学习分布图 */}
      {chartData.length > 0 && (
        <Card className="glass glow-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              近14天学习时长
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 记录列表 */}
      <Card className="glass glow-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            学习日志
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse bg-secondary/50 rounded-lg" />
                ))}
              </div>
            ) : logs && logs.length > 0 ? (
              <div className="space-y-3">
                {logs.map((log) => {
                  const mood = moodIcons[log.mood || "normal"];
                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <BrainCircuit className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium truncate">{log.title}</h3>
                          <div className="flex items-center gap-1">
                            <span className={`text-xs ${mood.color}`}>{mood.icon}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                setEvaluatingId(log.id);
                                aiEvaluate.mutate({ id: log.id }, {
                                  onSettled: () => setEvaluatingId(null),
                                });
                              }}
                              disabled={aiEvaluate.isPending}
                            >
                              {evaluatingId === log.id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Sparkles className="h-3 w-3 mr-1" />
                              )}
                              AI评估
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                setTestingId(log.id);
                                aiGenerateTests.mutate({ id: log.id, count: 5 }, {
                                  onSuccess: (data) => {
                                    setTestQuestions(data.questions);
                                    setCurrentTestIndex(0);
                                    setTestAnswers({});
                                    setTestResults({});
                                    setShowTest(true);
                                    setTestingId(null);
                                  },
                                  onError: () => setTestingId(null),
                                });
                              }}
                              disabled={aiGenerateTests.isPending}
                            >
                              {testingId === log.id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Sparkles className="h-3 w-3 mr-1" />
                              )}
                              测试
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                if (confirm("确定删除这条记录？")) {
                                  deleteLog.mutate({ id: log.id });
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {log.aiFeedback && (
                          <div className="text-xs text-primary/80 mt-0.5 bg-primary/5 p-1.5 rounded">
                            <span className="font-medium">AI评估：</span>
                            {log.aiFeedback}
                          </div>
                        )}
                        {log.content && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {log.content}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {log.duration} 分钟
                          </span>
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3" />
                            {"★".repeat(log.quality)}
                          </span>
                          {log.aiTestScore !== null && log.aiTestScore !== undefined && (
                            <span className="flex items-center gap-1 text-primary">
                              <Target className="h-3 w-3" />
                              测试{log.aiTestScore}分
                            </span>
                          )}
                          <span>
                            {new Date(log.date).toLocaleDateString("zh-CN")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <BrainCircuit className="h-10 w-10 mb-3" />
                <p>还没有学习记录</p>
                <p className="text-sm">点击右上角「记一笔」开始记录</p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 测试题弹窗 */}
      <Dialog open={showTest} onOpenChange={setShowTest}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              学习质量测试
            </DialogTitle>
          </DialogHeader>
          {testQuestions.length > 0 && currentTestIndex < testQuestions.length ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>题目 {currentTestIndex + 1} / {testQuestions.length}</span>
                <Badge variant="outline">{testQuestions[currentTestIndex].knowledgePoint}</Badge>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30 border border-border">
                <p className="font-medium mb-3">{testQuestions[currentTestIndex].content}</p>
                {testQuestions[currentTestIndex].options && (
                  <div className="space-y-2">
                    {testQuestions[currentTestIndex].options.map((opt: any) => (
                      <button
                        key={opt.label}
                        onClick={() => {
                          setTestAnswers({ ...testAnswers, [currentTestIndex]: opt.label });
                        }}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                          testAnswers[currentTestIndex] === opt.label
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-secondary/30"
                        }`}
                      >
                        <span className="font-medium text-primary mr-2">{opt.label}.</span>
                        {opt.text}
                      </button>
                    ))}
                  </div>
                )}
                {!testQuestions[currentTestIndex].options && (
                  <Textarea
                    placeholder="请输入你的答案"
                    value={testAnswers[currentTestIndex] || ""}
                    onChange={(e) => setTestAnswers({ ...testAnswers, [currentTestIndex]: e.target.value })}
                  />
                )}
              </div>
              {testResults[currentTestIndex] && (
                <div className={`p-3 rounded-lg ${testResults[currentTestIndex].isCorrect ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                  <div className="flex items-center gap-2">
                    {testResults[currentTestIndex].isCorrect ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className="text-sm font-medium">
                      {testResults[currentTestIndex].isCorrect ? "正确" : "错误"}
                    </span>
                    <Badge variant="outline">掌握度 {testResults[currentTestIndex].mastery}%</Badge>
                  </div>
                  <p className="text-sm mt-1">{testResults[currentTestIndex].explanation}</p>
                </div>
              )}
              <div className="flex gap-2">
                {!testResults[currentTestIndex] ? (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const q = testQuestions[currentTestIndex];
                      const userAns = testAnswers[currentTestIndex] || "";
                      const correct = userAns.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();
                      setTestResults({
                        ...testResults,
                        [currentTestIndex]: {
                          isCorrect: correct,
                          mastery: correct ? 80 : 30,
                          explanation: q.explanation || (correct ? "回答正确！" : `正确答案是：${q.correctAnswer}`),
                        },
                      });
                    }}
                    disabled={!testAnswers[currentTestIndex]}
                  >
                    提交答案
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      if (currentTestIndex < testQuestions.length - 1) {
                        setCurrentTestIndex(currentTestIndex + 1);
                      } else {
                        // 计算总分
                        const total = Object.values(testResults).filter((r: any) => r.isCorrect).length;
                        const score = Math.round((total / testQuestions.length) * 100);
                        toast.success(`测试完成！得分: ${score}分`);
                        setShowTest(false);
                      }
                    }}
                  >
                    {currentTestIndex < testQuestions.length - 1 ? "下一题" : "完成测试"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShowTest(false)}>
                  关闭
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
              <p>测试完成！</p>
              <Button className="mt-3" onClick={() => setShowTest(false)}>关闭</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
