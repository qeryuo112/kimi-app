import { useState, useEffect } from "react";
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
  CheckCircle2,
  AlertTriangle,
  Upload,
  X,
  FileText,
  Zap,
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

interface TestQuestion {
  id: string;
  content: string;
  options?: Array<{ label: string; text: string }>;
  correctAnswer: string;
  explanation: string;
  knowledgePoint: string;
  questionType?: "single_choice" | "multiple_choice" | "fill_blank" | "short_answer" | "essay" | "mixed";
}

export default function StudyLogs() {
  const { isAuthenticated } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  // ===== 表单状态（必须在查询之前定义） =====
  const [form, setForm] = useState({
    subjectId: undefined as number | undefined,
    nodeId: undefined as number | undefined,
    title: "",
    content: "",
    duration: 30,
    mood: "normal" as "great" | "good" | "normal" | "tired" | "bad",
    tags: "",
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

  // 获取知识点列表（根据选中的科目过滤）
  const { data: knowledgeTree } = trpc.knowledge.getTree.useQuery(
    { subjectId: form.subjectId || 0 },
    { enabled: !!form.subjectId && isAuthenticated }
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

  // AI生成测试题（针对已有记录）
  const aiGenerateTests = trpc.study.aiGenerateTests.useMutation({
    onSuccess: (data) => {
      toast.success(`生成 ${data.questions.length} 道测试题`);
    },
    onError: (err) => toast.error(err.message),
  });

  // 新：匹配题库题目
  const matchQuestions = trpc.study.matchQuestions.useMutation({
    onSuccess: (data) => {
      setTestQuestions(data.questions);
      setTestAnswers({});
      setTestStep("testing");
      toast.success(data.source === "database" ? `从题库匹配 ${data.questions.length} 道题目` : `AI生成 ${data.questions.length} 道题目`);
    },
    onError: (err) => {
      setTestStep("testing");
      toast.error(err.message);
      setTestOpen(false);
    },
  });

  // 新：提交学习测试
  const submitStudyTest = trpc.study.submitStudyTest.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
      setTestStep("result");
      utils.study.list.invalidate();
      utils.study.getStats.invalidate();
      utils.subject.list.invalidate();
      utils.knowledge.list.invalidate();
      utils.skill.list.invalidate();
      utils.todo.getReviews.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLog, setDetailLog] = useState<any>(null);
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [testAnswers, setTestAnswers] = useState<Record<number, string>>({});
  const [testResults, setTestResults] = useState<Record<number, any>>({});
  const [showTest, setShowTest] = useState(false);

  // 新：测试流程状态
  const [testOpen, setTestOpen] = useState(false);
  const [testStep, setTestStep] = useState<"loading" | "testing" | "result">("loading");
  const [newTestQuestions, setNewTestQuestions] = useState<TestQuestion[]>([]);
  const [newTestAnswers, setNewTestAnswers] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<any>(null);

  // 题目配置 + 文件上传
  const [testConfigOpen, setTestConfigOpen] = useState(false);
  const [testQuestionType, setTestQuestionType] = useState<"single_choice" | "multiple_choice" | "fill_blank" | "short_answer" | "essay" | "mixed">("mixed");
  const [testQuestionCount, setTestQuestionCount] = useState(5);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ url: string; name: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);

  const { data: settings } = trpc.settings.get.useQuery();

  const resetForm = () => {
    setForm({
      subjectId: undefined,
      nodeId: undefined,
      title: "",
      content: "",
      duration: 30,
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

  // 新：保存并测试（先打开配置对话框）
  const handleSaveAndTest = () => {
    if (!form.title.trim()) {
      toast.error("请输入学习标题");
      return;
    }
    if (!form.subjectId && !form.nodeId) {
      toast.error("请至少选择科目或知识点");
      return;
    }

    setIsDialogOpen(false);
    setTestConfigOpen(true);
    setTestQuestionType("mixed");
    setTestQuestionCount(5);
    setUploadedFiles([]);
  };

  // 从配置对话框开始测试
  const handleStartTest = () => {
    setTestConfigOpen(false);
    setTestOpen(true);
    setTestStep("loading");
    setNewTestQuestions([]);
    setNewTestAnswers({});
    setTestResult(null);

    console.log("[StudyLogs] handleStartTest", {
      subjectId: form.subjectId,
      nodeId: form.nodeId,
      questionType: testQuestionType,
      count: testQuestionCount,
      fileCount: uploadedFiles.length,
    });

    matchQuestions.mutate({
      subjectId: form.subjectId,
      nodeId: form.nodeId,
      count: testQuestionCount,
      questionType: testQuestionType,
      fileUrls: uploadedFiles.length > 0 ? uploadedFiles.map((f) => f.url) : undefined,
    });
  };

  // 文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(`${file.name} 上传失败: ${err.error || res.statusText}`);
          continue;
        }
        const data = await res.json();
        if (data.url) {
          setUploadedFiles((prev) => [...prev, { url: data.url, name: file.name }]);
          toast.success(`${file.name} 上传成功`);
        }
      } catch (err: any) {
        toast.error(`${file.name} 上传失败: ${err.message}`);
      }
    }
    setIsUploading(false);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // 新：提交测试答案
  const handleSubmitTest = () => {
    const unanswered = newTestQuestions.filter((q) => !newTestAnswers[q.id]);
    if (unanswered.length > 0) {
      if (!confirm(`还有 ${unanswered.length} 道题未作答，确定提交吗？`)) return;
    }

    console.log("[StudyLogs] handleSubmitTest 开始", {
      subjectId: form.subjectId,
      nodeId: form.nodeId,
      title: form.title,
      questionCount: newTestQuestions.length,
    });

    submitStudyTest.mutate({
      subjectId: form.subjectId,
      nodeId: form.nodeId,
      title: form.title,
      content: form.content,
      duration: form.duration,
      mood: form.mood,
      questions: newTestQuestions.map((q) => ({
        id: q.id,
        content: q.content,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        knowledgePoint: q.knowledgePoint,
        questionType: q.questionType || "single_choice",
      })),
      answers: newTestQuestions.map((q) => ({
        questionId: q.id,
        userAnswer: newTestAnswers[q.id] || "",
      })),
    });
  };

  // 当 matchQuestions 成功时同步题目
  useEffect(() => {
    if (matchQuestions.data?.questions) {
      setNewTestQuestions(matchQuestions.data.questions);
    }
  }, [matchQuestions.data]);

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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">关联科目</label>
                  <Select
                    value={form.subjectId ? String(form.subjectId) : ""}
                    onValueChange={(v) => {
                      const id = Number(v);
                      setForm({ ...form, subjectId: id, nodeId: undefined });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择科目" />
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">知识点</label>
                  <Select
                    value={form.nodeId ? String(form.nodeId) : ""}
                    onValueChange={(v) => setForm({ ...form, nodeId: Number(v) })}
                    disabled={!form.subjectId || !knowledgeTree?.nodes?.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={form.subjectId ? "选择知识点" : "先选科目"} />
                    </SelectTrigger>
                    <SelectContent>
                      {knowledgeTree?.nodes?.map((n) => (
                        <SelectItem key={n.id} value={String(n.id)}>
                          {n.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <label className="text-sm font-medium">心情</label>
                  <div className="flex gap-1">
                    {Object.entries(moodIcons).map(([key, { icon, label, color }]) => (
                      <button
                        key={key}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border transition-all ${
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
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreate} disabled={createLog.isPending} variant="outline">
                {createLog.isPending ? "保存中..." : "仅保存"}
              </Button>
              <Button onClick={handleSaveAndTest} disabled={matchQuestions.isPending}>
                {matchQuestions.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <BrainCircuit className="h-4 w-4 mr-1" />
                )}
                保存并测试
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
                                setDetailLog(log);
                                setDetailOpen(true);
                              }}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              详情
                            </Button>
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

      {/* 已有记录的测试题弹窗 */}
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

      {/* 题目配置弹窗 */}
      <Dialog open={testConfigOpen} onOpenChange={setTestConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              配置测试
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 题型和数量 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">题目类型</label>
                <select
                  value={testQuestionType}
                  onChange={(e) => setTestQuestionType(e.target.value as any)}
                  className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                >
                  <option value="single_choice">单选题</option>
                  <option value="multiple_choice">多选题</option>
                  <option value="fill_blank">填空题</option>
                  <option value="short_answer">简答题</option>
                  <option value="essay">论述题</option>
                  <option value="mixed">混合题型</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">题目数量</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={testQuestionCount}
                    onChange={(e) => setTestQuestionCount(parseInt(e.target.value) || 5)}
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground">道</span>
                </div>
              </div>
            </div>

            {/* 文件上传 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">上传学习材料（可选）</label>
              <Input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              {isUploading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  上传中...
                </p>
              )}
              {uploadedFiles.length > 0 && (
                <div className="space-y-1.5">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded bg-secondary/30">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => removeFile(idx)} className="h-6 w-6 p-0">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                上传PDF/Word/图片等，AI将基于文件内容出题。不上传则从题库匹配。
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTestConfigOpen(false)}>
              取消
            </Button>
            <Button onClick={handleStartTest} disabled={matchQuestions.isPending}>
              {matchQuestions.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BrainCircuit className="h-4 w-4 mr-1" />}
              开始测试
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新：学习测试弹窗（所有题目同时显示） */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              AI学习测试
            </DialogTitle>
          </DialogHeader>

          {testStep === "loading" && (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-muted-foreground">AI正在出题...</p>
            </div>
          )}

          {testStep === "testing" && (
            <div className="space-y-4">
              {newTestQuestions.map((q, idx) => {
                const isMultiple = q.questionType === "multiple_choice";
                const currentAnswer = newTestAnswers[q.id] || "";
                const selectedLabels = isMultiple
                  ? currentAnswer.split("").filter(Boolean)
                  : [currentAnswer].filter(Boolean);

                const toggleOption = (label: string) => {
                  if (isMultiple) {
                    const newLabels = selectedLabels.includes(label)
                      ? selectedLabels.filter((l) => l !== label)
                      : [...selectedLabels, label].sort();
                    setNewTestAnswers({ ...newTestAnswers, [q.id]: newLabels.join("") });
                  } else {
                    setNewTestAnswers({ ...newTestAnswers, [q.id]: label });
                  }
                };

                return (
                  <div key={q.id} className="p-3 rounded-lg bg-secondary/30 border border-border">
                    <p className="text-sm font-medium mb-2">
                      <span className="text-primary mr-1">{idx + 1}.</span>
                      {q.content}
                    </p>
                    {isMultiple && (
                      <p className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                        <span className="inline-flex items-center justify-center w-4 h-4 border border-amber-400 rounded text-[10px]">✓</span>
                        多选题：可选择多个答案
                      </p>
                    )}
                    {q.options && q.options.length > 0 ? (
                      <div className="space-y-1.5">
                        {q.options.map((opt) => {
                          const isSelected = selectedLabels.includes(opt.label);
                          return (
                            <button
                              key={opt.label}
                              onClick={() => toggleOption(opt.label)}
                              className={`w-full text-left p-2 rounded-lg border text-sm transition-colors ${
                                isSelected
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:bg-secondary/30"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className={`font-medium mr-2 ${isSelected ? "text-primary" : ""}`}>
                                  {isMultiple && (
                                    <span className={`inline-flex items-center justify-center w-5 h-5 border rounded ${isSelected ? "bg-primary border-primary text-white" : "border-border"}`}>
                                      {isSelected && "✓"}
                                    </span>
                                  )}
                                  {!isMultiple && `${opt.label}.`}
                                </span>
                                <span>{opt.text}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <Input
                        placeholder="请输入你的答案"
                        value={newTestAnswers[q.id] || ""}
                        onChange={(e) => setNewTestAnswers({ ...newTestAnswers, [q.id]: e.target.value })}
                      />
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1.5">知识点：{q.knowledgePoint}</p>
                  </div>
                );
              })}

              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSubmitTest} disabled={submitStudyTest.isPending}>
                  {submitStudyTest.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  提交答案
                </Button>
                <Button variant="outline" onClick={() => setTestOpen(false)}>取消</Button>
              </div>
            </div>
          )}

          {testStep === "result" && testResult && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg text-center ${testResult.mastery >= 70 ? "bg-green-500/10 border border-green-500/30" : testResult.mastery >= 50 ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  {testResult.mastery >= 70 ? <CheckCircle2 className="h-6 w-6 text-green-400" /> : <AlertTriangle className="h-6 w-6 text-yellow-400" />}
                  <span className="text-lg font-bold">掌握度 {testResult.mastery}%</span>
                </div>
                <p className="text-sm">{testResult.feedback}</p>
                <p className="text-xs text-muted-foreground mt-1">质量评分：{testResult.quality}/5 · 答对 {testResult.correctCount}/{testResult.totalCount} 题 · 下次复习：{testResult.nextReviewIn}天后</p>
              </div>

              {testResult.weakPoints && testResult.weakPoints.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <p className="text-sm font-medium text-red-400 flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    薄弱知识点
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {testResult.weakPoints.map((p: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {testResult.suggestions && testResult.suggestions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">AI建议</p>
                  {testResult.suggestions.map((s: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                      <span className="text-primary mt-0.5">•</span>
                      {s}
                    </p>
                  ))}
                </div>
              )}

              <Button className="w-full" onClick={() => {
                setTestOpen(false);
                setTestResult(null);
                resetForm();
              }}>
                完成
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 学习记录详情 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>学习记录详情</DialogTitle>
          </DialogHeader>
          {detailLog && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">主题</label>
                <p className="text-sm">{detailLog.title}</p>
              </div>
              {detailLog.content && (
                <div>
                  <label className="text-sm font-medium">内容</label>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detailLog.content}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">时长</label>
                  <p className="text-sm">{detailLog.duration} 分钟</p>
                </div>
                <div>
                  <label className="text-sm font-medium">日期</label>
                  <p className="text-sm">{new Date(detailLog.date).toLocaleString("zh-CN")}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">质量</label>
                  <p className="text-sm">{"★".repeat(detailLog.quality)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">心情</label>
                  <p className="text-sm">{moodIcons[detailLog.mood || "normal"].icon}</p>
                </div>
              </div>
              {detailLog.tags && (
                <div>
                  <label className="text-sm font-medium">标签</label>
                  <p className="text-sm text-muted-foreground">{detailLog.tags}</p>
                </div>
              )}
              {detailLog.aiFeedback && (
                <div>
                  <label className="text-sm font-medium">AI 评估</label>
                  <p className="text-sm text-primary/80 bg-primary/5 p-2 rounded">{detailLog.aiFeedback}</p>
                </div>
              )}
              {detailLog.aiTestScore !== null && detailLog.aiTestScore !== undefined && (
                <div>
                  <label className="text-sm font-medium">AI 测试分数</label>
                  <p className="text-sm">{detailLog.aiTestScore} 分</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
