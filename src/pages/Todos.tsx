import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { MathContent } from "@/components/MathContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Circle,
  Clock,
  BrainCircuit,
  Zap,
  RefreshCw,
  SkipForward,
  Loader2,
  CalendarDays,
  Target,
  AlertTriangle,
  XCircle,
  Trash2,
  Upload,
  FileText,
  X,
  Trophy,
} from "lucide-react";

interface TestQuestion {
  id: string;
  content: string;
  options?: Array<{ label: string; text: string }>;
  correctAnswer: string;
  explanation: string;
  knowledgePoint: string;
  questionType?: "single_choice" | "multiple_choice" | "fill_blank" | "short_answer" | "essay" | "mixed";
}

export default function Todos() {
  const utils = trpc.useUtils();
  const { data: todayData, isLoading } = trpc.todo.getToday.useQuery();
  const { data: history } = trpc.todo.list.useQuery({ limit: 30 });
  const { data: reviews } = trpc.todo.getReviews.useQuery();

  // 测试题弹窗状态
  const [testOpen, setTestOpen] = useState(false);
  const [activeTodoId, setActiveTodoId] = useState<number | null>(null);
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [testAnswers, setTestAnswers] = useState<Record<string, string>>({});
  const [testAnswerImages, setTestAnswerImages] = useState<Record<string, string[]>>({});
  const [actualMinutes, setActualMinutes] = useState(30);
  const [testStep, setTestStep] = useState<"loading" | "testing" | "result" | "select-source">("select-source");
  const [testResult, setTestResult] = useState<any>(null);
  const [testSource, setTestSource] = useState<"auto" | "file">("auto");
  const [testQuestionType, setTestQuestionType] = useState<"single_choice" | "multiple_choice" | "fill_blank" | "short_answer" | "essay" | "mixed">("mixed");
  const [testQuestionCount, setTestQuestionCount] = useState(5);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ url: string; name: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // 复习任务AI考官状态
  const [reviewTestOpen, setReviewTestOpen] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState<number | null>(null);
  const [reviewTestQuestions, setReviewTestQuestions] = useState<TestQuestion[]>([]);
  const [reviewTestAnswers, setReviewTestAnswers] = useState<Record<string, string>>({});
  const [reviewTestAnswerImages, setReviewTestAnswerImages] = useState<Record<string, string[]>>({});
  const [reviewTestStep, setReviewTestStep] = useState<"loading" | "testing" | "result" | "select-source">("select-source");
  const [reviewTestResult, setReviewTestResult] = useState<any>(null);
  const [reviewTestQuestionType, setReviewTestQuestionType] = useState<"single_choice" | "multiple_choice" | "fill_blank" | "short_answer" | "essay" | "mixed">("mixed");
  const [reviewTestQuestionCount, setReviewTestQuestionCount] = useState(5);
  const [isReviewResuming, setIsReviewResuming] = useState(false);

  // 复习详情查看状态
  const [reviewDetailOpen, setReviewDetailOpen] = useState(false);
  const [reviewDetailData, setReviewDetailData] = useState<any>(null);

  const questionTypeMap: Record<string, string> = {
    single_choice: "单选题",
    multiple_choice: "多选题",
    fill_blank: "填空题",
    short_answer: "简答题",
    essay: "论述题",
    mixed: "混合题型",
  };

  const { data: settings } = trpc.settings.get.useQuery();

  // 从 localStorage 恢复缓存的题目
  useEffect(() => {
    const cached = localStorage.getItem("ai-exam-cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.questions && parsed.questions.length > 0 && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          // 24小时内有效
          setIsResuming(true);
        }
      } catch {
        // 忽略解析错误
      }
    }
  }, []);

  // 从 localStorage 恢复缓存的复习测试
  useEffect(() => {
    const cached = localStorage.getItem("ai-review-cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.questions && parsed.questions.length > 0 && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          setIsReviewResuming(true);
        }
      } catch {
        // 忽略解析错误
      }
    }
  }, []);

  // 保存题目到 localStorage
  useEffect(() => {
    if (testQuestions.length > 0 && testStep === "testing") {
      const cache = {
        questions: testQuestions,
        answers: testAnswers,
        answerImages: testAnswerImages,
        todoId: activeTodoId,
        timestamp: Date.now(),
      };
      localStorage.setItem("ai-exam-cache", JSON.stringify(cache));
    }
  }, [testQuestions, testAnswers, testAnswerImages, testStep, activeTodoId]);

  // 保存复习测试到 localStorage
  useEffect(() => {
    if (reviewTestQuestions.length > 0 && reviewTestStep === "testing") {
      const cache = {
        questions: reviewTestQuestions,
        answers: reviewTestAnswers,
        answerImages: reviewTestAnswerImages,
        reviewId: activeReviewId,
        timestamp: Date.now(),
      };
      localStorage.setItem("ai-review-cache", JSON.stringify(cache));
    }
  }, [reviewTestQuestions, reviewTestAnswers, reviewTestAnswerImages, reviewTestStep, activeReviewId]);

  // 清除缓存
  const clearCache = () => {
    localStorage.removeItem("ai-exam-cache");
    setIsResuming(false);
  };

  const clearReviewCache = () => {
    localStorage.removeItem("ai-review-cache");
    setIsReviewResuming(false);
  };

  const generateTest = trpc.todo.generateTest.useMutation({
    onSuccess: (data) => {
      setTestQuestions(data.questions);
      setTestAnswers({});
      setTestAnswerImages({});
      setTestStep("testing");
      toast.success(data.source === "database" ? `从题库匹配 ${data.questions.length} 道题目` : `AI生成 ${data.questions.length} 道题目`);
    },
    onError: (err) => {
      setTestOpen(false);
      alert(err.message);
    },
  });

  const generateTestFromFiles = trpc.todo.generateTestFromFiles.useMutation({
    onSuccess: (data) => {
      setTestQuestions(data.questions);
      setTestAnswers({});
      setTestStep("testing");
      toast.success(`从文件生成 ${data.questions.length} 道题目`);
    },
    onError: (err) => {
      setTestStep("select-source");
      alert(err.message);
    },
  });

  const submitTest = trpc.todo.submitTest.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
      setTestStep("result");
      utils.todo.getToday.invalidate();
      utils.todo.getReviews.invalidate();
      utils.todo.list.invalidate();
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // 复习任务AI考官API
  const generateReviewTest = trpc.todo.generateReviewTest.useMutation({
    onSuccess: (data) => {
      setReviewTestQuestions(data.questions);
      setReviewTestAnswers({});
      setReviewTestAnswerImages({});
      setReviewTestStep("testing");
      toast.success(data.source === "database" ? `从题库匹配 ${data.questions.length} 道题目` : `AI生成 ${data.questions.length} 道题目`);
    },
    onError: (err) => {
      setReviewTestOpen(false);
      alert(err.message);
    },
  });

  const submitReviewTest = trpc.todo.submitReviewTest.useMutation({
    onSuccess: (data) => {
      setReviewTestResult(data);
      setReviewTestStep("result");
      utils.todo.getReviews.invalidate();
      utils.knowledge.list.invalidate();
      utils.skill.list.invalidate();
      toast.success(`复习完成！掌握度更新为 ${data.mastery}%`);
    },
    onError: (err) => {
      alert(err.message);
    },
  });

  // 复习详情和回退
  const getReviewDetail = trpc.todo.getReviewDetail.useMutation({
    onSuccess: (data) => {
      setReviewDetailData(data);
      setReviewDetailOpen(true);
    },
    onError: (err) => toast.error(err.message),
  });

  const rollbackReview = trpc.todo.rollbackReview.useMutation({
    onSuccess: () => {
      utils.todo.getReviews.invalidate();
      utils.knowledge.list.invalidate();
      utils.skill.list.invalidate();
      toast.success("复习数据已回退");
    },
    onError: (err) => toast.error(err.message),
  });

  // 删除复习安排
  const deleteReview = trpc.todo.deleteReview.useMutation({
    onSuccess: () => {
      utils.todo.getReviews.invalidate();
      utils.knowledge.list.invalidate();
      utils.skill.list.invalidate();
      toast.success("复习安排已删除");
    },
    onError: (err) => toast.error(err.message),
  });

  const skipTodo = trpc.todo.skip.useMutation({
    onSuccess: () => utils.todo.getToday.invalidate(),
  });

  const deleteTodo = trpc.todo.delete.useMutation({
    onSuccess: async () => {
      await utils.todo.getToday.refetch();
      await utils.todo.list.refetch();
      await utils.todo.getReviews.refetch();
      await utils.study.getStats.refetch();
      await utils.study.list.refetch();
      toast.success("任务已删除，数据已回退");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleStartTest = (todoId: number) => {
    setActiveTodoId(todoId);
    setTestOpen(true);
    setTestStep("select-source");
    setTestSource("auto");
    setUploadedFiles([]);
  };

  const handleConfirmSource = () => {
    if (!activeTodoId) return;
    setTestStep("loading");
    if (testSource === "file" && uploadedFiles.length > 0) {
      generateTestFromFiles.mutate({
        id: activeTodoId,
        urls: uploadedFiles.map((f) => f.url),
        questionType: testQuestionType,
        count: testQuestionCount,
      });
    } else {
      generateTest.mutate({
        id: activeTodoId,
        questionType: testQuestionType,
        count: testQuestionCount,
      });
    }
  };

  const handleResumeTest = () => {
    const cached = localStorage.getItem("ai-exam-cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setTestQuestions(parsed.questions);
        setTestAnswers(parsed.answers || {});
        setTestAnswerImages(parsed.answerImages || {});
        setActiveTodoId(parsed.todoId);
        setTestStep("testing");
        setTestOpen(true);
        setIsResuming(false);
      } catch {
        toast.error("恢复失败");
      }
    }
  };

  const handleResumeReviewTest = () => {
    const cached = localStorage.getItem("ai-review-cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setReviewTestQuestions(parsed.questions);
        setReviewTestAnswers(parsed.answers || {});
        setReviewTestAnswerImages(parsed.answerImages || {});
        setActiveReviewId(parsed.reviewId);
        setReviewTestStep("testing");
        setReviewTestOpen(true);
        setIsReviewResuming(false);
      } catch {
        toast.error("恢复失败");
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
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

    setUploadedFiles((prev) => [...prev, ...newFiles]);
    setIsUploading(false);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const [uploadingAnswerImageId, setUploadingAnswerImageId] = useState<string | null>(null);

  const handleAnswerImageUpload = async (
    questionId: string,
    file: File,
    setImages: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  ) => {
    setUploadingAnswerImageId(questionId);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`上传失败: ${err.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.url) {
        setImages((prev) => ({
          ...prev,
          [questionId]: [...(prev[questionId] || []), data.url],
        }));
        toast.success("图片上传成功");
      }
    } catch (err: any) {
      toast.error(`上传失败: ${err.message}`);
    } finally {
      setUploadingAnswerImageId(null);
    }
  };

  const removeAnswerImage = (
    questionId: string,
    index: number,
    setImages: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  ) => {
    setImages((prev) => {
      const list = prev[questionId] || [];
      return { ...prev, [questionId]: list.filter((_, i) => i !== index) };
    });
  };

  const handleSubmitTest = () => {
    if (!activeTodoId) return;
    const unanswered = testQuestions.filter((q) => {
      const hasText = !!testAnswers[q.id]?.trim();
      const hasImages = (testAnswerImages[q.id] || []).length > 0;
      return !hasText && !hasImages;
    });
    if (unanswered.length > 0) {
      if (!confirm(`还有 ${unanswered.length} 道题未作答，确定提交吗？`)) return;
    }

    submitTest.mutate({
      id: activeTodoId,
      actualMinutes,
      questions: testQuestions.map((q) => ({
        id: q.id,
        content: q.content,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        knowledgePoint: q.knowledgePoint,
        questionType: q.questionType || "single_choice",
      })),
      answers: testQuestions.map((q) => ({
        questionId: q.id,
        userAnswer: testAnswers[q.id] || "",
        imageUrls: testAnswerImages[q.id] || undefined,
      })),
    });
  };

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="h-5 w-5 text-green-400" />;
    if (status === "skipped") return <SkipForward className="h-5 w-5 text-muted-foreground" />;
    return <Circle className="h-5 w-5 text-primary" />;
  };

  const statusBadge = (status: string) => {
    if (status === "completed") return <Badge className="bg-green-500/20 text-green-400">已完成</Badge>;
    if (status === "skipped") return <Badge variant="outline">已跳过</Badge>;
    return <Badge variant="outline" className="bg-primary/10 text-primary">待完成</Badge>;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            今日任务
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date().toLocaleDateString("zh-CN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        {todayData?.summary && (
          <div className="text-right">
            <p className="text-2xl font-bold">{todayData.summary.progress}%</p>
            <p className="text-xs text-muted-foreground">完成进度</p>
          </div>
        )}
      </div>

      {/* 统计卡片 */}
      {todayData?.summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card><CardContent className="pt-4 text-center"><Clock className="h-5 w-5 text-primary mx-auto mb-1" /><p className="text-2xl font-bold">{todayData.summary.totalCount}</p><p className="text-xs text-muted-foreground">总任务</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><CheckCircle2 className="h-5 w-5 text-green-400 mx-auto mb-1" /><p className="text-2xl font-bold">{todayData.summary.completedCount}</p><p className="text-xs text-muted-foreground">已完成</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><Zap className="h-5 w-5 text-yellow-400 mx-auto mb-1" /><p className="text-2xl font-bold">{todayData.summary.completedMinutes}</p><p className="text-xs text-muted-foreground">已学习(分钟)</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><BrainCircuit className="h-5 w-5 text-purple-400 mx-auto mb-1" /><p className="text-2xl font-bold">{reviews?.length || 0}</p><p className="text-xs text-muted-foreground">待复习</p></CardContent></Card>
        </div>
      )}

      <Tabs defaultValue="today">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="today">今日任务</TabsTrigger>
          <TabsTrigger value="reviews">复习提醒</TabsTrigger>
          <TabsTrigger value="history">历史记录</TabsTrigger>
        </TabsList>

        {/* 今日任务 */}
        <TabsContent value="today" className="space-y-3 mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : !todayData || todayData.todos.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">暂无今日任务</h3>
                <p className="text-muted-foreground text-sm mb-4">前往「学习计划」页面，选择一个计划生成今日任务</p>
              </CardContent>
            </Card>
          ) : (
            todayData.todos.map((todo) => (
              <Card key={todo.id} className={todo.status === "completed" ? "border-green-500/30" : ""}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{statusIcon(todo.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{todo.subject}</span>
                          {statusBadge(todo.status)}
                          {todo.status === "pending" && todo.date !== new Date().toISOString().split("T")[0] && (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/20">
                              已延期
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline">{todo.estimatedMinutes}分钟</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{todo.focus}</p>
                      {(() => {
                        try {
                          const nodes = JSON.parse(todo.knowledgeNodes || "[]");
                          return (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {nodes.map((n: string, i: number) => (
                                <Badge key={i} variant="secondary" className="text-[10px]">{n}</Badge>
                              ))}
                            </div>
                          );
                        } catch { return null; }
                      })()}

                      {todo.status === "completed" && todo.aiEvaluation && (
                        <div className="mt-2 p-2 rounded bg-green-500/10 border border-green-500/20">
                          <div className="flex items-center gap-2">
                            <BrainCircuit className="h-3.5 w-3.5 text-green-400" />
                            <span className="text-xs font-medium text-green-400">AI考官评估</span>
                            <Badge variant="outline" className="text-[10px]">掌握度 {todo.aiMastery}%</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{todo.aiEvaluation}</p>
                        </div>
                      )}

                      {todo.status === "completed" && (
                        <div className="flex justify-end mt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
                            onClick={() => {
                              if (confirm("确定要删除此任务吗？删除后会回退所有相关数据（掌握度、进度、技能等级、学习统计、复习调度）。")) {
                                deleteTodo.mutate({ id: todo.id });
                              }
                            }}
                            disabled={deleteTodo.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            删除并回退数据
                          </Button>
                        </div>
                      )}

                      {todo.status === "pending" && (
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" onClick={() => handleStartTest(todo.id)}>
                            <BrainCircuit className="h-3.5 w-3.5 mr-1" />
                            完成（AI测试）
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => skipTodo.mutate({ id: todo.id })}>
                            <SkipForward className="h-3.5 w-3.5 mr-1" />
                            跳过
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2"
                            onClick={() => {
                              if (confirm("确定要删除此任务吗？")) {
                                deleteTodo.mutate({ id: todo.id });
                              }
                            }}
                            disabled={deleteTodo.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}

                      {todo.status === "skipped" && (
                        <div className="flex justify-end mt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
                            onClick={() => {
                              if (confirm("确定要删除此任务吗？")) {
                                deleteTodo.mutate({ id: todo.id });
                              }
                            }}
                            disabled={deleteTodo.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            删除任务
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* 复习提醒 */}
        <TabsContent value="reviews" className="space-y-3 mt-4">
          {!reviews || reviews.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">暂无复习任务</h3>
                <p className="text-muted-foreground text-sm">完成学习任务后，系统会自动安排复习</p>
              </CardContent>
            </Card>
          ) : (
            reviews.map((rev) => (
              <Card key={rev.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{rev.nodeTitle}</p>
                      <p className="text-sm text-muted-foreground">{rev.subjectTitle}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">第{rev.reviewCount + 1}次复习</Badge>
                      <p className="text-xs text-muted-foreground mt-1">掌握度 {rev.mastery}%</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-muted-foreground">首次学习：{rev.originalStudyDate} · 间隔 {rev.intervalDays} 天</p>
                    <div className="flex gap-2">
                      {rev.reviewCount > 0 && rev.snapshot && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => getReviewDetail.mutate({ reviewId: rev.id })}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            查看详情
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => {
                              if (confirm("确定要回退此次复习的数据吗？这会恢复到复习前的掌握度，但保留复习记录。")) {
                                rollbackReview.mutate({ reviewId: rev.id });
                              }
                            }}
                            disabled={rollbackReview.isPending}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            回退数据
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => {
                          if (confirm("确定删除这条复习安排吗？")) {
                            deleteReview.mutate({ reviewId: rev.id });
                          }
                        }}
                        disabled={deleteReview.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        删除
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const cached = localStorage.getItem("ai-review-cache");
                          if (cached) {
                            try {
                              const parsed = JSON.parse(cached);
                              if (parsed.reviewId === rev.id && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                                setReviewTestQuestions(parsed.questions);
                                setReviewTestAnswers(parsed.answers || {});
                                setReviewTestAnswerImages(parsed.answerImages || {});
                                setActiveReviewId(rev.id);
                                setReviewTestStep("testing");
                                setReviewTestOpen(true);
                                return;
                              }
                            } catch {
                              // ignore
                            }
                          }
                          setActiveReviewId(rev.id);
                          setReviewTestStep("select-source");
                          setReviewTestOpen(true);
                        }}
                      >
                        <BrainCircuit className="h-4 w-4 mr-1" />
                        AI考官
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* 历史记录 */}
        <TabsContent value="history" className="space-y-3 mt-4">
          {!history || history.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">暂无历史记录</p>
          ) : (
            history.map((h) => (
              <Card key={h.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusIcon(h.status)}
                      <span className="font-medium">{h.subject}</span>
                      {statusBadge(h.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{h.date}</span>
                      {h.status === "completed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-6 px-1.5"
                          onClick={() => {
                            if (confirm("确定要删除此任务吗？删除后会回退所有相关数据。")) {
                              deleteTodo.mutate({ id: h.id });
                            }
                          }}
                          disabled={deleteTodo.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{h.focus}</p>
                  {h.aiMastery !== null && h.aiMastery > 0 && (
                    <Badge variant="outline" className="mt-1 text-[10px]">掌握度 {h.aiMastery}%</Badge>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* 恢复测试提示 */}
      {isResuming && (
        <div className="fixed bottom-4 right-4 z-50">
          <Card className="border-primary/30 shadow-lg">
            <CardContent className="p-4">
              <p className="text-sm mb-2">发现有未完成的测试，是否继续？</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleResumeTest}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  继续测试
                </Button>
                <Button size="sm" variant="outline" onClick={clearCache}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  放弃
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI考官测试弹窗 */}
      <Dialog open={testOpen} onOpenChange={(open) => {
        if (!open) clearCache();
        setTestOpen(open);
      }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              AI考官测试
            </DialogTitle>
          </DialogHeader>

          {testStep === "select-source" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">选择出题方式：</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTestSource("auto")}
                  className={`p-4 rounded-lg border text-left transition-colors ${
                    testSource === "auto"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="font-medium">智能出题</span>
                  </div>
                  <p className="text-xs text-muted-foreground">优先从题库选题，不够时AI生成</p>
                </button>
                <button
                  onClick={() => setTestSource("file")}
                  className={`p-4 rounded-lg border text-left transition-colors ${
                    testSource === "file"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Upload className="h-4 w-4 text-primary" />
                    <span className="font-medium">上传文件</span>
                  </div>
                  <p className="text-xs text-muted-foreground">从PDF/Word/图片中出题</p>
                </button>
              </div>

              {/* 题目类型和数量设置 */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">题目类型</label>
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
                <div>
                  <label className="text-sm font-medium mb-1.5 block">题目数量</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={testQuestionCount}
                      onChange={(e) => setTestQuestionCount(parseInt(e.target.value) || 5)}
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground">道</span>
                  </div>
                </div>
              </div>

              {testSource === "file" && (
                <div className="space-y-3 pt-2">
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
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={handleConfirmSource}
                  disabled={testSource === "file" && uploadedFiles.length === 0}
                >
                  开始测试
                </Button>
                <Button variant="outline" onClick={() => setTestOpen(false)}>
                  取消
                </Button>
              </div>
            </div>
          )}

          {testStep === "loading" && (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-muted-foreground">AI正在出题...</p>
            </div>
          )}

          {testStep === "testing" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>实际学习时长：</span>
                <Input
                  type="number"
                  className="w-20 h-7 text-sm"
                  value={actualMinutes}
                  onChange={(e) => setActualMinutes(parseInt(e.target.value) || 0)}
                />
                <span>分钟</span>
              </div>

              {testQuestions.map((q, idx) => {
                const isMultiple = q.questionType === "multiple_choice";
                // 多选题答案解析为数组
                const currentAnswer = testAnswers[q.id] || "";
                const selectedLabels = isMultiple
                  ? currentAnswer.split("").filter(Boolean)
                  : [currentAnswer].filter(Boolean);

                const toggleOption = (label: string) => {
                  console.log("[Todos toggleOption] click", {
                    label,
                    questionId: q.id,
                    questionType: q.questionType,
                    isMultiple,
                    currentAnswer,
                    selectedLabels,
                    allAnswers: testAnswers,
                  });
                  if (isMultiple) {
                    const newLabels = selectedLabels.includes(label)
                      ? selectedLabels.filter((l) => l !== label)
                      : [...selectedLabels, label].sort();
                    const newAnswer = newLabels.join("");
                    console.log("[Todos toggleOption] multiple choice update", {
                      label,
                      newLabels,
                      newAnswer,
                    });
                    setTestAnswers({ ...testAnswers, [q.id]: newAnswer });
                  } else {
                    console.log("[Todos toggleOption] single choice update", {
                      label,
                    });
                    setTestAnswers({ ...testAnswers, [q.id]: label });
                  }
                };

                return (
                  <div key={q.id} className="p-3 rounded-lg bg-secondary/30 border border-border">
                    <div className="text-sm font-medium mb-2">
                      <span className="text-primary mr-1">{idx + 1}.</span>
                      <MathContent content={q.content} />
                    </div>
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
                                <MathContent content={opt.text} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          placeholder="请输入你的答案"
                          value={testAnswers[q.id] || ""}
                          onChange={(e) => setTestAnswers({ ...testAnswers, [q.id]: e.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                          {(testAnswerImages[q.id] || []).map((url, i) => (
                            <div key={i} className="relative group">
                              <img src={url} alt="" className="h-16 w-16 object-cover rounded border" />
                              <button
                                onClick={() => removeAnswerImage(q.id, i, setTestAnswerImages)}
                                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAnswerImageUpload(q.id, file, setTestAnswerImages);
                                e.target.value = "";
                              }}
                            />
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${uploadingAnswerImageId === q.id ? "opacity-50" : "hover:bg-secondary"}`}>
                              {uploadingAnswerImageId === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              上传图片
                            </span>
                          </label>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1.5">知识点：{q.knowledgePoint}</p>
                  </div>
                );
              })}

              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSubmitTest} disabled={submitTest.isPending}>
                  {submitTest.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
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
                <p className="text-xs text-muted-foreground mt-1">答对 {testResult.correctCount}/{testResult.totalCount} 题 · 下次复习：{testResult.nextReviewIn}天后</p>
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

              {/* 逐题解析 */}
              <div className="space-y-2 max-h-64 overflow-auto">
                <p className="text-sm font-medium">题目解析</p>
                {testQuestions.map((q, idx) => {
                  const userAns = testAnswers[q.id] || "";
                  const isMultiple = q.questionType === "multiple_choice";
                  // 多选题：排序后比较；单选题：直接比较
                  const normalizeAnswer = (ans: string) => {
                    const cleaned = ans.trim().toUpperCase();
                    if (isMultiple) {
                      // 多选题：去除逗号，排序字母
                      return cleaned.replace(/,/g, "").split("").sort().join("");
                    }
                    return cleaned;
                  };
                  const isCorrect = normalizeAnswer(userAns) === normalizeAnswer(q.correctAnswer);
                  return (
                    <div key={q.id} className={`p-2 rounded text-sm ${isCorrect ? "bg-green-500/5" : "bg-red-500/5"}`}>
                      <div className="flex items-center gap-2">
                        {isCorrect ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                        <div className="font-medium"><span>{idx + 1}.</span> <MathContent content={q.content} /></div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        你的答案：{userAns || "未作答"} · 正确答案：<MathContent content={q.correctAnswer} />
                      </p>
                      {(testAnswerImages[q.id] || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {testAnswerImages[q.id].map((url, i) => (
                            <img key={i} src={url} alt="" className="h-12 w-12 object-cover rounded border" />
                          ))}
                        </div>
                      )}
                      <MathContent content={q.explanation} className="text-xs text-primary mt-0.5" />
                    </div>
                  );
                })}
              </div>

              <Button className="w-full" onClick={() => { setTestOpen(false); setTestResult(null); }}>
                完成
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 复习任务AI考官弹窗 */}
      <Dialog open={reviewTestOpen} onOpenChange={(open) => {
        if (!open) clearReviewCache();
        setReviewTestOpen(open);
      }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              复习测试 - AI考官
            </DialogTitle>
          </DialogHeader>

          {reviewTestStep === "select-source" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">配置复习测试：</p>

              {/* 题目类型和数量设置 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">题目类型</label>
                  <select
                    value={reviewTestQuestionType}
                    onChange={(e) => setReviewTestQuestionType(e.target.value as any)}
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
                <div>
                  <label className="text-sm font-medium mb-1.5 block">题目数量</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={reviewTestQuestionCount}
                      onChange={(e) => setReviewTestQuestionCount(parseInt(e.target.value) || 5)}
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground">道</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (activeReviewId) {
                      setReviewTestStep("loading");
                      generateReviewTest.mutate({
                        reviewId: activeReviewId,
                        questionType: reviewTestQuestionType,
                        count: reviewTestQuestionCount,
                      });
                    }
                  }}
                >
                  开始复习测试
                </Button>
                <Button variant="outline" onClick={() => setReviewTestOpen(false)}>
                  取消
                </Button>
              </div>
            </div>
          )}

          {reviewTestStep === "loading" && (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-muted-foreground">AI正在出题...</p>
            </div>
          )}

          {reviewTestStep === "testing" && (
            <div className="space-y-4">
              {reviewTestQuestions.map((q, idx) => {
                const isMultiple = q.questionType === "multiple_choice";
                const currentAnswer = reviewTestAnswers[q.id] || "";
                const selectedLabels = isMultiple
                  ? currentAnswer.split("").filter(Boolean)
                  : [currentAnswer].filter(Boolean);

                const toggleOption = (label: string) => {
                  console.log("[Todos reviewToggleOption] click", {
                    label,
                    questionId: q.id,
                    questionType: q.questionType,
                    isMultiple,
                    currentAnswer,
                    selectedLabels,
                    allAnswers: reviewTestAnswers,
                  });
                  if (isMultiple) {
                    const newLabels = selectedLabels.includes(label)
                      ? selectedLabels.filter((l) => l !== label)
                      : [...selectedLabels, label].sort();
                    const newAnswer = newLabels.join("");
                    console.log("[Todos reviewToggleOption] multiple choice update", {
                      label,
                      newLabels,
                      newAnswer,
                    });
                    setReviewTestAnswers({ ...reviewTestAnswers, [q.id]: newAnswer });
                  } else {
                    console.log("[Todos reviewToggleOption] single choice update", {
                      label,
                    });
                    setReviewTestAnswers({ ...reviewTestAnswers, [q.id]: label });
                  }
                };

                return (
                  <div key={q.id} className="p-3 rounded-lg bg-secondary/30 border border-border">
                    <div className="text-sm font-medium mb-2">
                      <span className="text-primary mr-1">{idx + 1}.</span>
                      <MathContent content={q.content} />
                    </div>
                    {isMultiple && (
                      <p className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                        <span className="inline-flex items-center justify-center w-4 h-4 border border-amber-400 rounded text-[10px]">✓</span>
                        多选题：可选择多个答案
                      </p>
                    )}
                    {q.options && q.options.length > 0 ? (
                      <div className="space-y-1.5">
                        {q.options.map((opt: any) => {
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
                                    <span className={`inline-flex items-center justify-center w-4 h-4 border rounded mr-1 ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}>
                                      {isSelected && "✓"}
                                    </span>
                                  )}
                                  {opt.label}.
                                </span>
                                <MathContent content={opt.text} className="flex-1" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          className="w-full p-2 rounded-lg border border-border bg-background text-sm min-h-[80px]"
                          placeholder="请输入答案..."
                          value={reviewTestAnswers[q.id] || ""}
                          onChange={(e) => setReviewTestAnswers({ ...reviewTestAnswers, [q.id]: e.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                          {(reviewTestAnswerImages[q.id] || []).map((url, i) => (
                            <div key={i} className="relative group">
                              <img src={url} alt="" className="h-16 w-16 object-cover rounded border" />
                              <button
                                onClick={() => removeAnswerImage(q.id, i, setReviewTestAnswerImages)}
                                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleAnswerImageUpload(q.id, file, setReviewTestAnswerImages);
                                e.target.value = "";
                              }}
                            />
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${uploadingAnswerImageId === q.id ? "opacity-50" : "hover:bg-secondary"}`}>
                              {uploadingAnswerImageId === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              上传图片
                            </span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (activeReviewId) {
                      setReviewTestStep("loading");
                      submitReviewTest.mutate({
                        reviewId: activeReviewId,
                        questions: reviewTestQuestions,
                        answers: reviewTestQuestions.map((q) => ({
                          questionId: q.id,
                          userAnswer: reviewTestAnswers[q.id] || "",
                          imageUrls: reviewTestAnswerImages[q.id] || undefined,
                        })),
                      });
                    }
                  }}
                  disabled={reviewTestQuestions.some((q) => {
                    const hasText = !!reviewTestAnswers[q.id]?.trim();
                    const hasImages = (reviewTestAnswerImages[q.id] || []).length > 0;
                    return !hasText && !hasImages;
                  })}
                >
                  提交答案
                </Button>
              </div>
            </div>
          )}

          {reviewTestStep === "result" && reviewTestResult && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-2" />
                <p className="text-2xl font-bold">{reviewTestResult.mastery}%</p>
                <p className="text-sm text-muted-foreground">掌握度</p>
                <p className="text-xs text-muted-foreground mt-1">
                  上次: {reviewTestResult.previousMastery}% → 本次: {reviewTestResult.newMastery}% → 综合: {reviewTestResult.mastery}%
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-lg font-bold">{reviewTestResult.reviewCount}</p>
                  <p className="text-xs text-muted-foreground">已复习次数</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-lg font-bold">{reviewTestResult.nextReviewIn}天</p>
                  <p className="text-xs text-muted-foreground">下次复习</p>
                </div>
              </div>

              {reviewTestResult.status === "mastered" && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-sm text-green-400 font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    恭喜！该知识点已标记为已掌握
                  </p>
                </div>
              )}

              {reviewTestResult.suggestions && reviewTestResult.suggestions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">AI建议</p>
                  {reviewTestResult.suggestions.map((s: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                      <span className="text-primary mt-0.5">•</span>
                      {s}
                    </p>
                  ))}
                </div>
              )}

              <Button className="w-full" onClick={() => { setReviewTestOpen(false); setReviewTestResult(null); }}>
                完成
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 复习详情查看弹窗 */}
      <Dialog open={reviewDetailOpen} onOpenChange={setReviewDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              复习详情
            </DialogTitle>
          </DialogHeader>

          {reviewDetailData?.testDetails ? (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-lg font-bold">{reviewDetailData.testDetails.finalMastery}%</p>
                  <p className="text-xs text-muted-foreground">综合掌握度</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {reviewDetailData.testDetails.previousMastery}% → {reviewDetailData.testDetails.newMastery}%
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-lg font-bold">{reviewDetailData.testDetails.correctCount}/{reviewDetailData.testDetails.totalQuestions}</p>
                  <p className="text-xs text-muted-foreground">答对题数</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-lg font-bold">{new Date(reviewDetailData.testDetails.testDate).toLocaleDateString("zh-CN")}</p>
                  <p className="text-xs text-muted-foreground">测试日期</p>
                </div>
              </div>

              {/* 薄弱知识点 */}
              {reviewDetailData.testDetails.weakPoints && reviewDetailData.testDetails.weakPoints.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <p className="text-sm font-medium text-red-400 flex items-center gap-1">
                    <XCircle className="h-4 w-4" />
                    薄弱知识点
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {reviewDetailData.testDetails.weakPoints.map((p: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* AI建议 */}
              {reviewDetailData.testDetails.suggestions && reviewDetailData.testDetails.suggestions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">AI建议</p>
                  {reviewDetailData.testDetails.suggestions.map((s: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                      <span className="text-primary mt-0.5">•</span>
                      {s}
                    </p>
                  ))}
                </div>
              )}

              {/* 逐题详情 */}
              <div className="space-y-2 max-h-80 overflow-auto">
                <p className="text-sm font-medium">题目详情</p>
                {reviewDetailData.testDetails.questions.map((q: any, idx: number) => (
                  <div key={idx} className={`p-3 rounded text-sm ${q.isCorrect ? "bg-green-500/5" : "bg-red-500/5"}`}>
                    <div className="flex items-start gap-2">
                      {q.isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="font-medium"><span>{idx + 1}.</span> <MathContent content={q.content} /></div>
                        <p className="text-xs text-muted-foreground mt-1">
                          你的答案：{q.userAnswer || "未作答"} · 正确答案：<MathContent content={q.correctAnswer} />
                        </p>
                        {q.imageUrls && q.imageUrls.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {q.imageUrls.map((url: string, i: number) => (
                              <img key={i} src={url} alt="" className="h-12 w-12 object-cover rounded border" />
                            ))}
                          </div>
                        )}
                        {q.explanation && (
                          <MathContent content={q.explanation} className="text-xs text-primary mt-1" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setReviewDetailOpen(false)}
                >
                  关闭
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (confirm("确定要回退此次复习的数据吗？这会恢复到复习前的掌握度。")) {
                      rollbackReview.mutate(
                        { reviewId: reviewDetailData.review.id },
                        {
                          onSuccess: () => {
                            setReviewDetailOpen(false);
                            setReviewDetailData(null);
                          }
                        }
                      );
                    }
                  }}
                  disabled={rollbackReview.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  回退数据
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>暂无详细测试记录</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
