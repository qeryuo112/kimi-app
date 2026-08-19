import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Target,
  Plus,
  Loader2,
  Search,
  Calendar,
  Clock,
  Trash2,
  BookOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  Lightbulb,
  CheckSquare,
  Library,
  FileUp,
  X,
} from "lucide-react";

export default function Plans() {
  const utils = trpc.useUtils();
  const { data: plans, isLoading } = trpc.plan.list.useQuery();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [searchGoal, setSearchGoal] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ title: string; description: string; category: string; difficulty: number; priority: number; estimatedDays: number }>>([]);
  const [selectedSubjectIndices, setSelectedSubjectIndices] = useState<Set<number>>(new Set());
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [planRequirements, setPlanRequirements] = useState<Record<number, string>>({});
  const [showSelectSubjects, setShowSelectSubjects] = useState(false);
  const [selectedExistingIds, setSelectedExistingIds] = useState<Set<number>>(new Set());

  // 创建计划
  const createPlan = trpc.plan.create.useMutation({
    onSuccess: () => {
      utils.plan.list.invalidate();
      setShowCreate(false);
    },
  });

  // 删除计划
  const deletePlan = trpc.plan.delete.useMutation({
    onSuccess: () => utils.plan.list.invalidate(),
  });

  // AI搜索科目
  const aiSearch = trpc.plan.aiSearchSubjects.useMutation({
    onSuccess: (data) => {
      setSearchResults(data);
      setSelectedSubjectIndices(new Set(data.map((_, i) => i)));
    },
  });

  // 添加科目到计划
  const addSubjects = trpc.plan.addSubjectsToPlan.useMutation({
    onSuccess: () => {
      if (expandedPlan !== null) {
        utils.plan.getById.invalidate({ id: expandedPlan });
      }
      utils.plan.list.invalidate();
      setSearchResults([]);
      setSearchGoal("");
    },
  });

  // 添加已存在的科目到计划
  const addExistingSubjects = trpc.plan.addExistingSubjectsToPlan.useMutation({
    onSuccess: (data) => {
      if (expandedPlan !== null) {
        utils.plan.getById.invalidate({ id: expandedPlan });
      }
      utils.plan.list.invalidate();
      utils.subject.list.invalidate();
      setShowSelectSubjects(false);
      setSelectedExistingIds(new Set());
      const added = data.results.filter((r) => r.success).length;
      if (added > 0) {
        toast.success(`成功添加 ${added} 个科目到计划`);
      }
      const errors = data.results.filter((r) => !r.success);
      if (errors.length > 0) {
        errors.forEach((e) => toast.error(`${e.title || "科目"}: ${e.error}`));
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // 获取科目管理列表
  const { data: allSubjects } = trpc.subject.list.useQuery();

  // AI生成计划（一次性生成全部，向后兼容）
  const aiGenerateSchedule = trpc.plan.aiGenerateSchedule.useMutation({
    onSuccess: (data) => {
      if (expandedPlan !== null) {
        utils.plan.getById.invalidate({ id: expandedPlan });
      }
      toast.success(`复习计划框架生成成功！共 ${data.weeklyPlan?.length || 0} 周，请在周计划Tab中逐周生成日计划`);
    },
    onError: (err) => {
      toast.error(`生成失败: ${err.message}`);
    },
  });

  // 单独生成月计划
  const aiGenerateMonthly = trpc.plan.aiGenerateMonthly.useMutation({
    onSuccess: () => {
      if (expandedPlan !== null) utils.plan.getById.invalidate({ id: expandedPlan });
      toast.success("月计划生成成功！");
    },
    onError: (err) => toast.error(`月计划生成失败: ${err.message}`),
  });

  // 单独生成周计划
  const aiGenerateWeekly = trpc.plan.aiGenerateWeekly.useMutation({
    onSuccess: () => {
      if (expandedPlan !== null) utils.plan.getById.invalidate({ id: expandedPlan });
      toast.success("周计划生成成功！");
    },
    onError: (err) => toast.error(`周计划生成失败: ${err.message}`),
  });

  // 重新生成月计划
  const aiRegenerateMonthly = trpc.plan.aiRegenerateMonthly.useMutation({
    onSuccess: () => {
      if (expandedPlan !== null) utils.plan.getById.invalidate({ id: expandedPlan });
      toast.success("月计划已重新生成，周/日计划已清空");
    },
    onError: (err) => toast.error(`重新生成失败: ${err.message}`),
  });

  // 重新生成周计划
  const aiRegenerateWeekly = trpc.plan.aiRegenerateWeekly.useMutation({
    onSuccess: () => {
      if (expandedPlan !== null) utils.plan.getById.invalidate({ id: expandedPlan });
      toast.success("周计划已重新生成，日计划已清空");
    },
    onError: (err) => toast.error(`重新生成失败: ${err.message}`),
  });

  // 删除生成的复习计划
  const deleteSchedule = trpc.plan.deleteSchedule.useMutation({
    onSuccess: () => {
      if (expandedPlan !== null) {
        utils.plan.getById.invalidate({ id: expandedPlan });
      }
      utils.plan.list.invalidate();
      toast.success("复习计划已删除");
    },
    onError: (err) => toast.error(err.message),
  });

  // 按月生成周计划（支持重新生成）
  const [generatingMonth, setGeneratingMonth] = useState<number | null>(null);
  const aiGenerateMonthlyWeekly = trpc.plan.aiGenerateMonthlyWeekly.useMutation({
    onSuccess: (data) => {
      if (expandedPlan !== null) {
        utils.plan.getById.invalidate({ id: expandedPlan });
      }
      toast.success(`第${data.monthNumber}月周计划生成成功！共 ${data.weeksCount} 周`);
      setGeneratingMonth(null);
    },
    onError: (err) => {
      toast.error(`生成失败: ${err.message}`);
      setGeneratingMonth(null);
    },
  });

  // 按周生成日计划（支持重新生成）
  const [generatingWeek, setGeneratingWeek] = useState<number | null>(null);
  const aiGenerateWeeklyDaily = trpc.plan.aiGenerateWeeklyDaily.useMutation({
    onSuccess: (data) => {
      if (expandedPlan !== null) {
        utils.plan.getById.invalidate({ id: expandedPlan });
      }
      toast.success(`第${data.weekNumber}周日计划生成成功！共 ${data.daysCount} 天`);
      setGeneratingWeek(null);
    },
    onError: (err) => {
      toast.error(`生成失败: ${err.message}`);
      setGeneratingWeek(null);
    },
  });

  // 周回顾测试
  const [reviewWeek, setReviewWeek] = useState<number | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewAnswers, setReviewAnswers] = useState<Record<number, string>>({});
  const [reviewStep, setReviewStep] = useState<"intro" | "test" | "result">("intro");
  const [reviewResult, setReviewResult] = useState<any>(null);

  const aiGenerateWeeklyReview = trpc.plan.aiGenerateWeeklyReview.useMutation({
    onSuccess: (data) => {
      if (expandedPlan !== null) {
        utils.plan.getById.invalidate({ id: expandedPlan });
      }
      toast.success(`第${data.weekNumber}周回顾测试生成成功！共 ${data.questionsCount} 题`);
      setReviewWeek(null);
    },
    onError: (err) => {
      toast.error(`生成失败: ${err.message}`);
      setReviewWeek(null);
    },
  });

  const { data: weeklyReviewData, refetch: refetchWeeklyReview } = trpc.plan.getWeeklyReview.useQuery(
    { planId: expandedPlan!, weekNumber: reviewWeek! },
    { enabled: expandedPlan !== null && reviewWeek !== null }
  );

  const submitWeeklyReview = trpc.plan.submitWeeklyReview.useMutation({
    onSuccess: (data) => {
      if (expandedPlan !== null) {
        utils.plan.getById.invalidate({ id: expandedPlan });
      }
      setReviewResult(data);
      setReviewStep("result");
      toast.success(`测试完成！得分：${data.score}分`);
    },
    onError: (err) => toast.error(`提交失败: ${err.message}`),
  });

  const generateTodos = trpc.todo.generateTodayTodos.useMutation({
    onSuccess: (data) => {
      utils.todo.getToday.invalidate();
      toast.success(data.generated ? `已生成 ${data.count} 个今日任务` : data.message);
    },
    onError: (err) => toast.error(err.message),
  });

  // 获取当前展开计划的详情
  const { data: planDetail } = trpc.plan.getById.useQuery(
    { id: expandedPlan! },
    { enabled: expandedPlan !== null }
  );

  const [form, setForm] = useState({
    title: "",
    description: "",
    goal: "",
    dailyMinutes: 120,
    totalMonths: 6,
    reviewRounds: 3,
  });

  // 上传计划文件相关状态
  const [showUploadPlanDialog, setShowUploadPlanDialog] = useState(false);
  const [uploadPlanFiles, setUploadPlanFiles] = useState<Array<{ url: string; name: string }>>([]);
  const [uploadPlanSubjectIds, setUploadPlanSubjectIds] = useState<Set<number>>(new Set());
  const [uploadPlanScope, setUploadPlanScope] = useState<"monthly" | "weekly" | "daily">("daily");
  const [isUploadingPlanFile, setIsUploadingPlanFile] = useState(false);
  const [uploadPlanRequirements, setUploadPlanRequirements] = useState("");

  // 从上传的计划文件生成复习计划
  const aiGenerateFromPlanFile = trpc.plan.aiGenerateFromPlanFile.useMutation({
    onSuccess: (data) => {
      if (expandedPlan !== null) {
        utils.plan.getById.invalidate({ id: expandedPlan });
      }
      const scopeText = data.dailyPlan?.length ? "完整计划" : data.weeklyPlan?.length ? "到周计划" : "到月计划";
      const unmatchedCount = data.unmatchedContent?.length || 0;
      toast.success(`计划文件解析成功！生成${scopeText}${unmatchedCount > 0 ? `，有 ${unmatchedCount} 处内容未能匹配到知识节点` : ""}`);
      setShowUploadPlanDialog(false);
      setUploadPlanFiles([]);
      setUploadPlanSubjectIds(new Set());
      setUploadPlanScope("daily");
      setUploadPlanRequirements("");
    },
    onError: (err) => {
      toast.error(`计划文件解析失败: ${err.message}`);
    },
  });

  const handleCreate = () => {
    if (!form.title.trim()) return;
    createPlan.mutate(form);
  };

  // 上传计划文件到文件服务器
  const handleUploadPlanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPlanFile(true);
    const newFiles: Array<{ url: string; name: string }> = [];

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
          newFiles.push({ url: data.url, name: file.name });
        }
      } catch (err: any) {
        toast.error(`${file.name} 上传失败: ${err.message}`);
      }
    }

    setUploadPlanFiles((prev) => [...prev, ...newFiles]);
    setIsUploadingPlanFile(false);
    e.target.value = "";
  };

  // 提交计划文件解析请求
  const handleGenerateFromPlanFile = (planId: number) => {
    if (uploadPlanFiles.length === 0) {
      toast.error("请先上传计划文件");
      return;
    }
    if (uploadPlanSubjectIds.size === 0) {
      toast.error("请至少选择一个已有科目");
      return;
    }

    aiGenerateFromPlanFile.mutate({
      planId,
      subjectIds: Array.from(uploadPlanSubjectIds),
      fileUrl: uploadPlanFiles[0].url,
      scope: uploadPlanScope,
      requirements: uploadPlanRequirements || undefined,
    });
  };

  const removeUploadPlanFile = (index: number) => {
    setUploadPlanFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSearch = () => {
    if (!searchGoal.trim()) return;
    aiSearch.mutate({ goal: searchGoal });
  };

  const handleAddSubjects = () => {
    if (!selectedPlanId || searchResults.length === 0) return;
    const selectedSubjects = searchResults.filter((_, i) => selectedSubjectIndices.has(i));
    if (selectedSubjects.length === 0) return;
    addSubjects.mutate({
      planId: selectedPlanId,
      subjects: selectedSubjects.map((s) => ({
        title: s.title,
        description: s.description,
        category: s.category,
        difficulty: s.difficulty,
        priority: s.priority,
      })),
    });
  };

  const toggleSubject = (index: number) => {
    const next = new Set(selectedSubjectIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedSubjectIndices(next);
  };

  const toggleAll = () => {
    if (selectedSubjectIndices.size === searchResults.length) {
      setSelectedSubjectIndices(new Set());
    } else {
      setSelectedSubjectIndices(new Set(searchResults.map((_, i) => i)));
    }
  };

  const statusColor: Record<string, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  const statusText: Record<string, string> = {
    active: "进行中",
    paused: "已暂停",
    completed: "已完成",
  };

  return (
    <>
    <div className="p-6 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            学习计划
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            设定学习目标，AI自动分析科目并生成科学复习计划
          </p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              新建计划
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>创建学习计划</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium">计划名称</label>
                <Input
                  placeholder="如：2026考研复习"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">目标描述</label>
                <Textarea
                  placeholder="如：考取计算机专业研究生"
                  value={form.goal}
                  onChange={(e) => setForm({ ...form, goal: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">详细描述</label>
                <Textarea
                  placeholder="可选"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">每日时长(分钟)</label>
                  <Input
                    type="number"
                    value={form.dailyMinutes}
                    onChange={(e) => setForm({ ...form, dailyMinutes: parseInt(e.target.value) || 120 })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">总时长(月)</label>
                  <Input
                    type="number"
                    min={1}
                    max={36}
                    value={form.totalMonths}
                    onChange={(e) => setForm({ ...form, totalMonths: parseInt(e.target.value) || 6 })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">复习轮数</label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.reviewRounds}
                    onChange={(e) => setForm({ ...form, reviewRounds: parseInt(e.target.value) || 3 })}
                  />
                </div>
              </div>
              <Button onClick={handleCreate} disabled={createPlan.isPending} className="w-full">
                {createPlan.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                创建计划
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 计划列表 */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !plans || plans.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">还没有学习计划</h3>
            <p className="text-muted-foreground mb-4">创建一个计划，让AI帮你规划学习路径</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              新建计划
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <Card key={plan.id} className={selectedPlanId === plan.id ? "border-primary/50" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{plan.title}</CardTitle>
                    <Badge variant="outline" className={statusColor[plan.status]}>
                      {statusText[plan.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                    >
                      {expandedPlan === plan.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("确定要删除此学习计划吗？\n\n将删除：每日任务、复习调度、周测回顾、计划-科目关联\n保留：科目、知识树、题库（可在新计划中复用）")) {
                          deletePlan.mutate({ id: plan.id });
                        }
                      }}
                      disabled={deletePlan.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {plan.startDate ? new Date(plan.startDate).toLocaleDateString("zh-CN") : "未设置"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {plan.dailyMinutes}分钟/天
                  </span>
                  {plan.goal && <span>目标：{plan.goal}</span>}
                </div>
              </CardHeader>

              {expandedPlan === plan.id && (
                <CardContent>
                  <Tabs defaultValue="subjects" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="subjects">科目管理</TabsTrigger>
                      <TabsTrigger value="schedule">复习计划</TabsTrigger>
                      <TabsTrigger value="settings">设置</TabsTrigger>
                    </TabsList>

                    <TabsContent value="subjects" className="space-y-4 mt-4">
                      {/* AI搜索科目 */}
                      {selectedPlanId === plan.id ? (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Input
                              placeholder="输入学习目标，如：考研计算机"
                              value={searchGoal}
                              onChange={(e) => setSearchGoal(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            />
                            <Button onClick={handleSearch} disabled={aiSearch.isPending}>
                              {aiSearch.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="h-4 w-4" />
                              )}
                            </Button>
                          </div>

                          {searchResults.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">AI推荐的科目：</p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={toggleAll}
                                >
                                  {selectedSubjectIndices.size === searchResults.length ? "取消全选" : "全选"}
                                </Button>
                              </div>
                              {searchResults.map((s, i) => {
                                const isSelected = selectedSubjectIndices.has(i);
                                return (
                                  <div
                                    key={i}
                                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                                      isSelected
                                        ? "bg-primary/10 border-primary/40"
                                        : "bg-secondary/30 border-border hover:bg-secondary/50"
                                    }`}
                                    onClick={() => toggleSubject(i)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div
                                          className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                            isSelected
                                              ? "bg-primary border-primary"
                                              : "border-muted-foreground/30"
                                          }`}
                                        >
                                          {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                                        </div>
                                        <span className="font-medium">{s.title}</span>
                                      </div>
                                      <div className="flex gap-2">
                                        <Badge variant="outline">难度{s.difficulty}</Badge>
                                        <Badge variant="outline">优先级{s.priority}</Badge>
                                      </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1 pl-7">
                                      {s.description}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1 pl-7">
                                      预计{s.estimatedDays}天 · {s.category}
                                    </p>
                                  </div>
                                );
                              })}
                              <Button
                                onClick={handleAddSubjects}
                                disabled={addSubjects.isPending || selectedSubjectIndices.size === 0}
                                className="w-full"
                              >
                                <Sparkles className="h-4 w-4 mr-1" />
                                {addSubjects.isPending
                                  ? "分析并添加中..."
                                  : `添加所选科目 (${selectedSubjectIndices.size}/${searchResults.length})`}
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedPlanId(plan.id)}
                          >
                            <Search className="h-4 w-4 mr-1" />
                            AI搜索科目
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPlanId(plan.id);
                              setShowSelectSubjects(true);
                              setSelectedExistingIds(new Set());
                            }}
                          >
                            <Library className="h-4 w-4 mr-1" />
                            从科目管理选择
                          </Button>
                        </div>
                      )}

                      {/* 从科目管理选择科目弹窗 */}
                      {selectedPlanId === plan.id && showSelectSubjects && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">选择科目管理中的科目：</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                const analyzed = allSubjects?.filter((s) => s.status === "analyzed" && !planDetail?.subjects?.some((ps) => ps.id === s.id));
                                if (analyzed?.length) {
                                  setSelectedExistingIds(new Set(analyzed.map((s) => s.id)));
                                }
                              }}
                            >
                              全选
                            </Button>
                          </div>

                          {allSubjects?.filter((s) => s.status === "analyzed" && !planDetail?.subjects?.some((ps) => ps.id === s.id)).length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              没有可用的已分析科目。请先前往「科目管理」导入并分析科目。
                            </p>
                          ) : (
                            <div className="space-y-2 max-h-[300px] overflow-auto">
                              {allSubjects
                                ?.filter((s) => s.status === "analyzed" && !planDetail?.subjects?.some((ps) => ps.id === s.id))
                                .map((s) => {
                                  const isSelected = selectedExistingIds.has(s.id);
                                  return (
                                    <div
                                      key={s.id}
                                      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                                        isSelected
                                          ? "bg-primary/10 border-primary/40"
                                          : "bg-secondary/30 border-border hover:bg-secondary/50"
                                      }`}
                                      onClick={() => {
                                        const next = new Set(selectedExistingIds);
                                        if (next.has(s.id)) {
                                          next.delete(s.id);
                                        } else {
                                          next.add(s.id);
                                        }
                                        setSelectedExistingIds(next);
                                      }}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <div
                                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                              isSelected
                                                ? "bg-primary border-primary"
                                                : "border-muted-foreground/30"
                                            }`}
                                          >
                                            {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                                          </div>
                                          <span className="font-medium">{s.title}</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <Badge variant="outline">难度{s.difficulty}</Badge>
                                          <Badge variant="outline">优先级{s.priority}</Badge>
                                        </div>
                                      </div>
                                      {s.description && (
                                        <p className="text-sm text-muted-foreground mt-1 pl-7">
                                          {s.description}
                                        </p>
                                      )}
                                      <p className="text-xs text-muted-foreground mt-1 pl-7">
                                        {s.category || "未分类"} · 已分析
                                      </p>
                                    </div>
                                  );
                                })}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                if (!selectedPlanId || selectedExistingIds.size === 0) return;
                                addExistingSubjects.mutate({
                                  planId: selectedPlanId,
                                  subjectIds: Array.from(selectedExistingIds),
                                });
                              }}
                              disabled={addExistingSubjects.isPending || selectedExistingIds.size === 0}
                              className="flex-1"
                            >
                              {addExistingSubjects.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <BookOpen className="h-4 w-4 mr-1" />
                              )}
                              添加所选科目 ({selectedExistingIds.size})
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowSelectSubjects(false);
                                setSelectedExistingIds(new Set());
                              }}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* 已关联科目 */}
                      {planDetail && planDetail.subjects && planDetail.subjects.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">计划科目：</p>
                          {planDetail.subjects.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border"
                            >
                              <div className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-primary" />
                                <span>{s.title}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">进度{s.progress}%</Badge>
                                <Badge variant="outline">难度{s.difficulty}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">暂无科目，使用AI搜索添加</p>
                      )}
                    </TabsContent>

                    <TabsContent value="schedule" className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1">
                          <Lightbulb className="h-3.5 w-3.5 text-yellow-400" />
                          你的需求（可选）
                        </label>
                        <Textarea
                          placeholder="例如：我英语基础薄弱，希望多分配时间给英语；数学已经很好了可以减少时间；工作日每天只能学2小时，周末可以学4小时..."
                          value={planRequirements[plan.id] || ""}
                          onChange={(e) => setPlanRequirements({ ...planRequirements, [plan.id]: e.target.value })}
                          className="min-h-[80px] text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          告诉AI你的实际情况和偏好，生成的计划会更贴合你的需求
                        </p>
                      </div>

                      {/* 上传计划文件生成 */}
                      <div className="p-3 rounded-lg bg-secondary/20 border border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileUp className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">已有复习计划文件？</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setExpandedPlan(plan.id);
                              setShowUploadPlanDialog(true);
                              // 默认选中当前计划已关联的科目
                              if (planDetail?.subjects) {
                                setUploadPlanSubjectIds(new Set(planDetail.subjects.map((s: any) => s.id)));
                              }
                            }}
                          >
                            上传计划文件
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          上传PDF、Word、图片等格式的复习计划，AI将结合已有科目知识树生成标准计划
                        </p>
                      </div>

                      {/* 计划生成按钮组 */}
                      {(() => {
                        const schedule = plan.aiPlan ? JSON.parse(plan.aiPlan) : null;
                        const hasMonthly = schedule?.monthlyPlan?.length > 0;
                        const hasWeekly = schedule?.weeklyPlan?.length > 0;
                        const reqs = planRequirements[plan.id] || undefined;

                        const isGenerating = aiGenerateSchedule.isPending || aiGenerateMonthly.isPending || aiGenerateWeekly.isPending || aiRegenerateMonthly.isPending || aiRegenerateWeekly.isPending;

                        return (
                          <div className="space-y-2">
                            {!hasMonthly ? (
                              // 无计划：生成月计划
                              <Button
                                onClick={() => {
                                  setSelectedPlanId(plan.id);
                                  aiGenerateMonthly.mutate({ id: plan.id, requirements: reqs });
                                }}
                                disabled={isGenerating}
                                className="w-full"
                              >
                                <Sparkles className="h-4 w-4 mr-1" />
                                {aiGenerateMonthly.isPending ? "生成中..." : "AI生成月计划"}
                              </Button>
                            ) : !hasWeekly ? (
                              // 有月计划无周计划
                              <div className="flex gap-2 w-full">
                                <Button
                                  variant="outline"
                                  onClick={() => aiRegenerateMonthly.mutate({ id: plan.id, requirements: reqs })}
                                  disabled={isGenerating}
                                  className="flex-1"
                                >
                                  <Sparkles className="h-4 w-4 mr-1" />
                                  {aiRegenerateMonthly.isPending ? "生成中..." : "重新生成月计划"}
                                </Button>
                                <Button
                                  onClick={() => aiGenerateWeekly.mutate({ id: plan.id, requirements: reqs })}
                                  disabled={isGenerating}
                                  className="flex-1"
                                >
                                  <Sparkles className="h-4 w-4 mr-1" />
                                  {aiGenerateWeekly.isPending ? "生成中..." : "生成周计划"}
                                </Button>
                              </div>
                            ) : (
                              // 有月计划和周计划
                              <div className="flex gap-2 w-full">
                                <Button
                                  variant="outline"
                                  onClick={() => aiRegenerateMonthly.mutate({ id: plan.id, requirements: reqs })}
                                  disabled={isGenerating}
                                  className="flex-1"
                                >
                                  <Sparkles className="h-4 w-4 mr-1" />
                                  {aiRegenerateMonthly.isPending ? "生成中..." : "重新生成月计划"}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => aiRegenerateWeekly.mutate({ id: plan.id, requirements: reqs })}
                                  disabled={isGenerating}
                                  className="flex-1"
                                >
                                  <Sparkles className="h-4 w-4 mr-1" />
                                  {aiRegenerateWeekly.isPending ? "生成中..." : "重新生成周计划"}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => aiGenerateSchedule.mutate({ id: plan.id, requirements: reqs })}
                                  disabled={isGenerating}
                                  className="flex-1"
                                >
                                  <Sparkles className="h-4 w-4 mr-1" />
                                  {aiGenerateSchedule.isPending ? "生成中..." : "全部重新生成"}
                                </Button>
                              </div>
                            )}

                            {/* 生成今日任务 + 删除 */}
                            <div className="flex gap-2 w-full">
                              <Button
                                variant="outline"
                                onClick={() => generateTodos.mutate({ planId: plan.id })}
                                disabled={generateTodos.isPending || !plan.aiPlan}
                                className="flex-1"
                              >
                                <CheckSquare className="h-4 w-4 mr-1" />
                                {generateTodos.isPending ? "生成中..." : "生成今日任务"}
                              </Button>
                              {plan.aiPlan && (
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm("确定要删除此复习计划吗？删除后可以重新生成。")) {
                                      deleteSchedule.mutate({ id: plan.id });
                                    }
                                  }}
                                  disabled={deleteSchedule.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* 未分析科目提示 */}
                      {planDetail && planDetail.subjects && planDetail.subjects.some((s: any) => s.status !== "analyzed") && (
                        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm">
                          <span className="font-medium text-yellow-400">提示：</span>
                          部分科目尚未进行AI分析。生成计划前，请先进入「科目管理」页面对各科目执行AI分析，生成知识树后计划才会细化到知识点级别。
                        </div>
                      )}

                      {plan.aiPlan && (
                        <div className="space-y-4">
                          {(() => {
                            try {
                              const schedule = JSON.parse(plan.aiPlan);
                              const hasRounds = schedule.roundPlan && Array.isArray(schedule.roundPlan);
                              const hasMonthly = schedule.monthlyPlan && Array.isArray(schedule.monthlyPlan);
                              const hasWeekly = schedule.weeklyPlan && Array.isArray(schedule.weeklyPlan);
                              const hasDaily = schedule.dailyPlan && Array.isArray(schedule.dailyPlan);

                              return (
                                <Tabs defaultValue="rounds" className="w-full">
                                  <TabsList className="grid w-full grid-cols-4">
                                    <TabsTrigger value="rounds">轮次</TabsTrigger>
                                    <TabsTrigger value="months">月度</TabsTrigger>
                                    <TabsTrigger value="weeks">周度</TabsTrigger>
                                    <TabsTrigger value="days">日度</TabsTrigger>
                                  </TabsList>

                                  {/* 轮次计划 */}
                                  <TabsContent value="rounds" className="space-y-2 mt-3">
                                    {hasRounds ? schedule.roundPlan.map((r: any, i: number) => (
                                      <div key={i} className="p-3 rounded-lg bg-secondary/20 border border-border">
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium">{r.name || `第${r.round}轮`}</span>
                                          <Badge variant="outline">第{r.months?.join("、")}月</Badge>
                                        </div>
                                        <p className="text-sm text-primary mt-1">{r.focus}</p>
                                        <p className="text-xs text-muted-foreground mt-1">策略：{r.strategy}</p>
                                      </div>
                                    )) : <p className="text-sm text-muted-foreground">暂无轮次计划</p>}
                                  </TabsContent>

                                  {/* 月计划 */}
                                  <TabsContent value="months" className="space-y-2 mt-3">
                                    {hasMonthly ? schedule.monthlyPlan.map((m: any, i: number) => {
                                      const monthNum = m.month;
                                      const isMonthGenerating = generatingMonth === monthNum;
                                      const generatedMonths: number[] = schedule.generatedMonths || [];
                                      const hasWeeklyForMonth = schedule.weeklyPlan?.some((w: any) => w.month === monthNum);
                                      const isGenerated = generatedMonths.includes(monthNum) || hasWeeklyForMonth;

                                      return (
                                        <div key={i} className="p-3 rounded-lg bg-secondary/20 border border-border">
                                          <div className="flex items-center justify-between">
                                            <span className="font-medium">{m.monthName || `第${m.month}个月`}</span>
                                            <div className="flex gap-1">
                                              <Badge variant="outline">第{m.round}轮</Badge>
                                              <Badge variant="outline">{m.subjects?.length || 0}科</Badge>
                                            </div>
                                          </div>
                                          <p className="text-sm text-primary mt-1">{m.focus}</p>
                                          <div className="flex flex-wrap gap-1 mt-1.5">
                                            {m.subjects?.map((s: string, idx: number) => (
                                              <Badge key={idx} variant="secondary" className="text-xs">{s}</Badge>
                                            ))}
                                          </div>
                                          {m.goals && m.goals.length > 0 && (
                                            <div className="mt-2 space-y-0.5">
                                              {m.goals.map((g: string, idx: number) => (
                                                <p key={idx} className="text-xs text-muted-foreground flex items-center gap-1">
                                                  <Target className="h-3 w-3" />{g}
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                          <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                                            {isMonthGenerating ? (
                                              <Button variant="ghost" size="sm" disabled className="w-full h-7 text-xs">
                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                生成中...
                                              </Button>
                                            ) : isGenerated ? (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full h-7 text-xs"
                                                onClick={() => {
                                                  setGeneratingMonth(monthNum);
                                                  aiGenerateMonthlyWeekly.mutate({
                                                    planId: plan.id,
                                                    monthNumber: monthNum,
                                                    requirements: planRequirements[plan.id] || undefined,
                                                    force: true,
                                                  });
                                                }}
                                              >
                                                <Sparkles className="h-3 w-3 mr-1" />
                                                重新生成周计划
                                              </Button>
                                            ) : (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full h-7 text-xs"
                                                onClick={() => {
                                                  setGeneratingMonth(monthNum);
                                                  aiGenerateMonthlyWeekly.mutate({
                                                    planId: plan.id,
                                                    monthNumber: monthNum,
                                                    requirements: planRequirements[plan.id] || undefined,
                                                  });
                                                }}
                                              >
                                                <Sparkles className="h-3 w-3 mr-1" />
                                                生成周计划
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    }) : <p className="text-sm text-muted-foreground">暂无月计划</p>}
                                  </TabsContent>

                                  {/* 周计划 */}
                                  <TabsContent value="weeks" className="space-y-2 mt-3 max-h-[500px] overflow-auto">
                                    {hasWeekly ? schedule.weeklyPlan.map((w: any, i: number) => {
                                      const weekNum = w.week;
                                      const isGenerated = (schedule.generatedWeeks || []).includes(weekNum);
                                      const hasDailyForWeek = schedule.dailyPlan?.some((d: any) => d.week === weekNum);
                                      const isGenerating = generatingWeek === weekNum;

                                      return (
                                        <div key={i} className="p-3 rounded-lg bg-secondary/20 border border-border">
                                          <div className="flex items-center justify-between">
                                            <span className="font-medium text-sm">第{w.week}周</span>
                                            <Badge variant="outline">第{w.month}月</Badge>
                                          </div>
                                          <p className="text-sm text-primary mt-1">{w.focus}</p>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {w.subjects?.map((s: string, idx: number) => (
                                              <Badge key={idx} variant="secondary" className="text-[10px]">{s}</Badge>
                                            ))}
                                          </div>
                                          {w.knowledgeNodes && w.knowledgeNodes.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {w.knowledgeNodes.map((n: string, idx: number) => (
                                                <Badge key={idx} variant="outline" className="text-[10px]">{n}</Badge>
                                              ))}
                                            </div>
                                          )}
                                          <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                                            {isGenerating ? (
                                              <Button variant="ghost" size="sm" disabled className="w-full h-7 text-xs">
                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                生成中...
                                              </Button>
                                            ) : isGenerated || hasDailyForWeek ? (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full h-7 text-xs"
                                                onClick={() => {
                                                  setGeneratingWeek(weekNum);
                                                  aiGenerateWeeklyDaily.mutate({
                                                    planId: plan.id,
                                                    weekNumber: weekNum,
                                                    requirements: planRequirements[plan.id] || undefined,
                                                    force: true,
                                                  });
                                                }}
                                              >
                                                <Sparkles className="h-3 w-3 mr-1" />
                                                重新生成日计划
                                              </Button>
                                            ) : (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full h-7 text-xs"
                                                onClick={() => {
                                                  setGeneratingWeek(weekNum);
                                                  aiGenerateWeeklyDaily.mutate({
                                                    planId: plan.id,
                                                    weekNumber: weekNum,
                                                    requirements: planRequirements[plan.id] || undefined,
                                                  });
                                                }}
                                              >
                                                <Sparkles className="h-3 w-3 mr-1" />
                                                生成日计划
                                              </Button>
                                            )}
                                            {/* 周回顾测试按钮 */}
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              className="w-full h-7 text-xs"
                                              onClick={() => {
                                                setReviewWeek(weekNum);
                                                setReviewStep("intro");
                                                setReviewAnswers({});
                                                setReviewResult(null);
                                                setShowReviewDialog(true);
                                              }}
                                            >
                                              <Target className="h-3 w-3 mr-1" />
                                              周回顾测试
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    }) : <p className="text-sm text-muted-foreground">暂无周计划</p>}
                                  </TabsContent>

                                  {/* 日计划 */}
                                  <TabsContent value="days" className="space-y-3 mt-3 max-h-[500px] overflow-auto">
                                    {hasDaily ? (() => {
                                      // 按 day 分组，同一天多个科目合并展示
                                      const dayGroups = new Map<number, any[]>();
                                      schedule.dailyPlan.forEach((d: any) => {
                                        if (!dayGroups.has(d.day)) dayGroups.set(d.day, []);
                                        dayGroups.get(d.day)!.push(d);
                                      });
                                      return Array.from(dayGroups.entries()).map(([dayNum, items]) => {
                                        const first = items[0];
                                        const isReviewDay = items.every((d: any) => d.review);
                                        return (
                                          <div
                                            key={dayNum}
                                            className={`p-3 rounded-lg border ${isReviewDay ? "bg-purple-500/5 border-purple-500/20" : "bg-secondary/20 border-border"}`}
                                          >
                                            <div className="flex items-center justify-between mb-2">
                                              <span className="font-medium text-sm">
                                                Day {dayNum} · {first.date}
                                                {isReviewDay && (
                                                  <Badge variant="outline" className="ml-2 text-xs bg-purple-500/10 text-purple-400">回顾日</Badge>
                                                )}
                                              </span>
                                              <div className="flex gap-1">
                                                <Badge variant="outline" className="text-[10px]">第{first.week}周</Badge>
                                                <Badge variant="outline" className="text-[10px]">第{first.month}月</Badge>
                                              </div>
                                            </div>
                                            <div className="space-y-2">
                                              {items.map((day: any, idx: number) => (
                                                <div key={idx} className="border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
                                                  <div className="flex items-center justify-between">
                                                    <span className="text-xs font-medium text-primary">{day.subject}</span>
                                                    <Badge variant="outline" className="text-[10px]">{day.estimatedMinutes || 0}分钟</Badge>
                                                  </div>
                                                  <p className="text-xs text-muted-foreground mt-0.5">{day.focus}</p>
                                                  {day.knowledgeNodes && day.knowledgeNodes.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                      {day.knowledgeNodes.map((node: string, nidx: number) => (
                                                        <Badge key={nidx} variant="secondary" className="text-[10px]">{node}</Badge>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      });
                                    })() : <p className="text-sm text-muted-foreground">暂无日计划</p>}
                                  </TabsContent>
                                </Tabs>
                              );
                            } catch {
                              return <p className="text-sm text-muted-foreground">计划数据格式错误</p>;
                            }
                          })()}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="settings" className="space-y-4 mt-4">
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium">计划状态</label>
                          <div className="flex gap-2 mt-1">
                            {(["active", "paused", "completed"] as const).map((status) => (
                              <Button
                                key={status}
                                variant={plan.status === status ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  trpc.plan.update.useMutation({
                                    onSuccess: () => utils.plan.list.invalidate(),
                                  }).mutate({ id: plan.id, status });
                                }}
                              >
                                {statusText[status]}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium">每日学习时长</label>
                          <Input
                            type="number"
                            defaultValue={plan.dailyMinutes}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (val > 0) {
                                trpc.plan.update.useMutation({
                                  onSuccess: () => utils.plan.list.invalidate(),
                                }).mutate({ id: plan.id, dailyMinutes: val });
                              }
                            }}
                          />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>

    {/* 周回顾测试弹窗 */}
    <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>第{reviewWeek}周 · 回顾测试</DialogTitle>
          </DialogHeader>

          {reviewStep === "intro" && weeklyReviewData && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-secondary/20">
                <h4 className="font-medium mb-2">本周知识点总结</h4>
                <p className="text-sm text-muted-foreground">{weeklyReviewData.knowledgeSummary || "暂无总结"}</p>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>题目数量：{weeklyReviewData.totalQuestions}题</span>
                <span>状态：{weeklyReviewData.status === "completed" ? "已完成" : "未开始"}</span>
              </div>
              {weeklyReviewData.status === "completed" ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">测试得分</span>
                      <span className="text-2xl font-bold text-green-600">{weeklyReviewData.testScore}分</span>
                    </div>
                    <p className="text-sm mt-2">答对 {weeklyReviewData.correctCount}/{weeklyReviewData.totalQuestions} 题</p>
                  </div>
                  {weeklyReviewData.aiFeedback && (
                    <div className="p-3 rounded-lg bg-blue-500/10">
                      <p className="text-sm">{weeklyReviewData.aiFeedback}</p>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => setReviewStep("test")}
                  disabled={!weeklyReviewData.questions || weeklyReviewData.questions.length === 0}
                >
                  开始测试
                </Button>
              )}
            </div>
          )}

          {reviewStep === "intro" && !weeklyReviewData && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">回顾测试尚未生成，请先生成测试题目。</p>
              <Button
                className="w-full"
                onClick={() => {
                  if (reviewWeek) {
                    aiGenerateWeeklyReview.mutate({
                      planId: expandedPlan!,
                      weekNumber: reviewWeek,
                    });
                  }
                }}
                disabled={aiGenerateWeeklyReview.isPending}
              >
                {aiGenerateWeeklyReview.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    生成回顾测试
                  </>
                )}
              </Button>
            </div>
          )}

          {reviewStep === "test" && weeklyReviewData?.questions && (
            <div className="space-y-4">
              {weeklyReviewData.questions.map((q: any, idx: number) => (
                <div key={q.id} className="p-4 rounded-lg border border-border">
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-primary min-w-[24px]">{idx + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <p className="text-sm">{q.content}</p>
                      {q.options && (() => {
                        try {
                          const opts = JSON.parse(q.options);
                          return (
                            <div className="space-y-1">
                              {opts.map((opt: any) => (
                                <label key={opt.label} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/50 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`question-${q.id}`}
                                    value={opt.label}
                                    checked={reviewAnswers[q.id] === opt.label}
                                    onChange={(e) => setReviewAnswers({ ...reviewAnswers, [q.id]: e.target.value })}
                                    className="accent-primary"
                                  />
                                  <span className="text-sm">{opt.label}. {opt.text}</span>
                                </label>
                              ))}
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                      {!q.options && (
                        <Input
                          placeholder="请输入答案"
                          value={reviewAnswers[q.id] || ""}
                          onChange={(e) => setReviewAnswers({ ...reviewAnswers, [q.id]: e.target.value })}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <Button
                className="w-full"
                onClick={() => {
                  const answers = Object.entries(reviewAnswers).map(([questionId, userAnswer]) => ({
                    questionId: parseInt(questionId),
                    userAnswer,
                  }));
                  if (reviewWeek) {
                    submitWeeklyReview.mutate({
                      planId: expandedPlan!,
                      weekNumber: reviewWeek,
                      answers,
                    });
                  }
                }}
                disabled={submitWeeklyReview.isPending || Object.keys(reviewAnswers).length < weeklyReviewData.questions.length}
              >
                {submitWeeklyReview.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    提交中...
                  </>
                ) : (
                  "提交答案"
                )}
              </Button>
            </div>
          )}

          {reviewStep === "result" && reviewResult && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                <div className="text-3xl font-bold text-green-600">{reviewResult.score}分</div>
                <p className="text-sm mt-1">答对 {reviewResult.correctCount}/{reviewResult.totalQuestions} 题</p>
                <div className="mt-2">
                  <Badge variant={reviewResult.masteryLevel >= 80 ? "default" : reviewResult.masteryLevel >= 60 ? "secondary" : "destructive"}>
                    掌握度 {reviewResult.masteryLevel}%
                  </Badge>
                </div>
              </div>

              {reviewResult.aiFeedback && (
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <h4 className="font-medium text-sm mb-1">AI评估</h4>
                  <p className="text-sm">{reviewResult.aiFeedback}</p>
                </div>
              )}

              {reviewResult.weakPoints && reviewResult.weakPoints.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10">
                  <h4 className="font-medium text-sm mb-1 text-red-600">薄弱知识点</h4>
                  <div className="flex flex-wrap gap-1">
                    {reviewResult.weakPoints.map((wp: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">{wp}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {reviewResult.strongPoints && reviewResult.strongPoints.length > 0 && (
                <div className="p-3 rounded-lg bg-green-500/10">
                  <h4 className="font-medium text-sm mb-1 text-green-600">掌握良好</h4>
                  <div className="flex flex-wrap gap-1">
                    {reviewResult.strongPoints.map((sp: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">{sp}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <Button className="w-full" onClick={() => setShowReviewDialog(false)}>
                关闭
              </Button>
            </div>
          )}
        </DialogContent>
    </Dialog>

    {/* 上传计划文件对话框 */}
    <Dialog open={showUploadPlanDialog} onOpenChange={setShowUploadPlanDialog}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>上传计划文件</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            上传你的复习计划文件（PDF、Word、图片等），AI将结合已选科目的本地知识树生成标准计划。
          </p>

          {/* 科目选择 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">选择文件对应的已有科目</label>
            {allSubjects && allSubjects.length > 0 ? (
              <div className="space-y-2 max-h-[200px] overflow-y-auto p-2 rounded-lg bg-secondary/20 border border-border">
                {allSubjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uploadPlanSubjectIds.has(s.id)}
                      onChange={() => {
                        const next = new Set(uploadPlanSubjectIds);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        setUploadPlanSubjectIds(next);
                      }}
                      className="rounded border-border"
                    />
                    <span>{s.title}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无可用科目，请先去「科目管理」创建科目</p>
            )}
          </div>

          {/* 生成范围选择 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">生成范围</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "monthly", label: "到月计划" },
                { value: "weekly", label: "到周计划" },
                { value: "daily", label: "完整计划" },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                    uploadPlanScope === option.value
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-secondary/20 border-border hover:bg-secondary/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="uploadPlanScope"
                    value={option.value}
                    checked={uploadPlanScope === option.value}
                    onChange={() => setUploadPlanScope(option.value as any)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {uploadPlanScope === "monthly"
                ? "只生成轮次和月计划，后续可手动生成周/日计划"
                : uploadPlanScope === "weekly"
                ? "生成到周计划，后续可分周生成每日任务"
                : "一次性生成完整四层计划"}
            </p>
          </div>

          {/* 文件上传 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">计划文件</label>
            <Input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
              onChange={handleUploadPlanFile}
              disabled={isUploadingPlanFile || aiGenerateFromPlanFile.isPending}
            />
            {uploadPlanFiles.length > 0 && (
              <div className="space-y-1">
                {uploadPlanFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded bg-secondary/30 text-sm">
                    <span className="truncate">{file.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeUploadPlanFile(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {isUploadingPlanFile && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                上传中...
              </div>
            )}
          </div>

          {/* 额外需求 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">额外需求（可选）</label>
            <Textarea
              placeholder="例如：重点强化药理学，药剂学可适当减少时间..."
              value={uploadPlanRequirements}
              onChange={(e) => setUploadPlanRequirements(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>

          {/* 提交按钮 */}
          <Button
            onClick={() => {
              if (expandedPlan !== null) {
                handleGenerateFromPlanFile(expandedPlan);
              }
            }}
            disabled={
              aiGenerateFromPlanFile.isPending ||
              isUploadingPlanFile ||
              uploadPlanFiles.length === 0 ||
              uploadPlanSubjectIds.size === 0
            }
            className="w-full"
          >
            {aiGenerateFromPlanFile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            {aiGenerateFromPlanFile.isPending ? "解析中..." : "AI解析计划文件"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
