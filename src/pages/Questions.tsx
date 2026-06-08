import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MathContent } from "@/components/MathContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileQuestion,
  Plus,
  Loader2,
  Sparkles,
  BookOpen,
  CheckCircle,
  XCircle,
  Trophy,
  AlertTriangle,
  RotateCcw,
  X,
  Upload,
  Link,
  Trash2,
  FileText,
  FolderOpen,
  Clock,
  Eye,
  BrainCircuit,
  FlaskConical,
} from "lucide-react";

export default function Questions() {
  const utils = trpc.useUtils();
  const { data: questionList, isLoading } = trpc.question.list.useQuery();
  const { data: stats } = trpc.question.getStats.useQuery();
  const { data: wrongAnswers } = trpc.question.getWrongAnswers.useQuery();

  const [activeTab, setActiveTab] = useState("all");
  const [showGenerate, setShowGenerate] = useState(false);
  const [showRecognize, setShowRecognize] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [answerResult, setAnswerResult] = useState<any>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());

  const [genForm, setGenForm] = useState({
    topic: "",
    knowledgeContent: "",
    questionType: "single_choice" as const,
    count: 5,
    difficulty: 3,
    requireChemicalStructure: false,
    customInstructions: "",
  });

  // AI出题模式切换：text | file
  const [generateMode, setGenerateMode] = useState<"text" | "file">("text");
  const [genFiles, setGenFiles] = useState<Array<{ url: string; name: string }>>([]);
  const [genManualUrl, setGenManualUrl] = useState("");
  const [isGenUploading, setIsGenUploading] = useState(false);

  // 文档识别状态
  const [recForm, setRecForm] = useState({
    questionType: "single_choice" as const,
  });
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ url: string; name: string }>>([]);
  const [recognizedQuestions, setRecognizedQuestions] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  // 组卷状态
  const [showCreatePaper, setShowCreatePaper] = useState(false);
  const [paperForm, setPaperForm] = useState({
    title: "",
    description: "",
    timeLimit: 60,
  });
  const [selectedPaperQuestions, setSelectedPaperQuestions] = useState<Set<number>>(new Set());
  const [questionScores, setQuestionScores] = useState<Record<number, number>>({}); // 每道题的自定义分数

  // 试卷详情查看状态
  const [viewingPaper, setViewingPaper] = useState<any>(null);
  const [paperDetailData, setPaperDetailData] = useState<any>(null);

  // AI 分析状态
  const [analyzingPaperId, setAnalyzingPaperId] = useState<number | null>(null);

  const { data: settings } = trpc.settings.get.useQuery();

  // 获取学科和知识点列表，用于显示关联信息
  const { data: subjects } = trpc.subject.list.useQuery();
  const { data: knowledgeNodes } = trpc.knowledge.list.useQuery();

  // 获取试卷列表
  const { data: examPapers } = trpc.exam.list.useQuery();

  // 创建映射表，方便查找
  const subjectMap = new Map<number, { id: number; title: string }>((subjects || []).map((s: { id: number; title: string }) => [s.id, s]));
  const nodeMap = new Map<number, { id: number; title: string }>((knowledgeNodes || []).map((n: { id: number; title: string }) => [n.id, n]));

  // AI从文件出题
  const aiGenerateFromUrls = trpc.question.aiGenerateFromUrls.useMutation({
    onSuccess: (data) => {
      toast.success(`成功生成 ${data.questions?.length || 0} 道题目`);
      utils.question.list.invalidate();
      setShowGenerate(false);
      setGenFiles([]);
      setGenManualUrl("");
      setGenerateMode("text");
    },
    onError: (err) => {
      toast.error(err.message || "出题失败");
    },
  });

  // 文档识别
  const recognizeFromUrls = trpc.question.recognizeFromUrls.useMutation({
    onSuccess: (data) => {
      toast.success(`成功识别 ${data.questions?.length || 0} 道题目`);
      setRecognizedQuestions(data.questions || []);
      utils.question.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "识别失败");
    },
  });

  // AI出题
  const aiGenerate = trpc.question.aiGenerate.useMutation({
    onSuccess: (data) => {
      toast.success(`成功生成 ${data.questions?.length || 0} 道题目`);
      utils.question.list.invalidate();
      setShowGenerate(false);
      setGenForm({ topic: "", knowledgeContent: "", questionType: "single_choice", count: 5, difficulty: 3, requireChemicalStructure: false });
    },
    onError: (err) => {
      toast.error(err.message || "出题失败");
    },
  });

  // 提交答案
  const submitAnswer = trpc.question.submitAnswer.useMutation({
    onSuccess: (data) => {
      setAnswerResult(data);
      utils.question.getStats.invalidate();
      utils.question.getWrongAnswers.invalidate();
    },
  });

  // 标记已掌握
  const markMastered = trpc.question.markMastered.useMutation({
    onSuccess: () => utils.question.getWrongAnswers.invalidate(),
  });

  // 删除错题记录
  const deleteWrongAnswer = trpc.question.deleteWrongAnswer.useMutation({
    onSuccess: () => {
      utils.question.getWrongAnswers.invalidate();
      utils.question.getStats.invalidate();
      toast.success("错题记录已删除");
    },
  });

  // 删除题目
  const deleteQuestion = trpc.question.delete.useMutation({
    onSuccess: () => {
      utils.question.list.invalidate();
      utils.question.getStats.invalidate();
      utils.question.getWrongAnswers.invalidate();
      toast.success("题目已删除");
    },
  });

  // 批量删除题目
  const deleteManyQuestions = trpc.question.deleteMany.useMutation({
    onSuccess: (data) => {
      utils.question.list.invalidate();
      utils.question.getStats.invalidate();
      utils.question.getWrongAnswers.invalidate();
      setSelectedQuestions(new Set());
      toast.success(`已删除 ${data.count} 道题目`);
    },
  });

  // 创建试卷
  const createPaper = trpc.exam.create.useMutation({
    onSuccess: () => {
      utils.exam.list.invalidate();
      setShowCreatePaper(false);
      setPaperForm({ title: "", description: "", timeLimit: 60 });
      setSelectedPaperQuestions(new Set());
      toast.success("试卷创建成功");
    },
    onError: (err) => {
      toast.error(err.message || "创建失败");
    },
  });

  // 删除试卷
  const deletePaper = trpc.exam.delete.useMutation({
    onSuccess: () => {
      utils.exam.list.invalidate();
      toast.success("试卷已删除");
    },
  });

  // AI 分析试卷
  const analyzePaper = trpc.exam.analyze.useMutation({
    onSuccess: (data) => {
      toast.success("试卷分析完成");
      utils.exam.list.invalidate();
      setAnalyzingPaperId(null);
      // 如果正在查看该试卷，更新详情
      if (viewingPaper && data.analysis) {
        setPaperDetailData((prev: any) => ({
          ...prev,
          paper: { ...prev?.paper, aiAnalysis: JSON.stringify(data.analysis) },
        }));
      }
    },
    onError: (err) => {
      toast.error(err.message || "分析失败");
      setAnalyzingPaperId(null);
    },
  });

  // 试卷详情查询
  const paperDetailQuery = trpc.exam.getById.useQuery(
    { id: viewingPaper?.id || 0 },
    { enabled: !!viewingPaper?.id }
  );

  // 当查询数据返回时更新 paperDetailData
  useEffect(() => {
    if (paperDetailQuery.data) {
      setPaperDetailData(paperDetailQuery.data);
    }
  }, [paperDetailQuery.data]);

  // 更新题目
  const updateQuestion = trpc.question.update.useMutation({
    onSuccess: (data) => {
      utils.question.list.invalidate();
      if (data.aiRegenerated) {
        toast.success("题目已更新，AI已重新生成答案和解析");
      } else {
        toast.success("题目已更新");
      }
      setEditingQuestion(null);
    },
    onError: (err) => {
      toast.error(err.message || "更新失败");
    },
  });

  // 编辑状态
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    content: "",
    correctAnswer: "",
    explanation: "",
    difficulty: 3,
    imageUrl: "",
  });
  const [editOptions, setEditOptions] = useState<Array<{ label: string; text: string }>>([]);
  const [isEditImageUploading, setIsEditImageUploading] = useState(false);
  const [showAnswerMap, setShowAnswerMap] = useState<Record<number, boolean>>({});

  const startEdit = (q: any) => {
    setEditingQuestion(q);
    setEditForm({
      content: q.content,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || "",
      difficulty: q.difficulty,
      imageUrl: q.imageUrl || "",
    });
    // 解析选项
    try {
      const opts = q.options ? JSON.parse(q.options) : [];
      setEditOptions(Array.isArray(opts) ? opts : []);
    } catch {
      setEditOptions([]);
    }
  };

  const handleUpdate = () => {
    if (!editingQuestion) return;
    updateQuestion.mutate({
      id: editingQuestion.id,
      content: editForm.content,
      options: JSON.stringify(editOptions),
      correctAnswer: editForm.correctAnswer,
      explanation: editForm.explanation,
      difficulty: editForm.difficulty,
      imageUrl: editForm.imageUrl || null,
    });
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsEditImageUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`上传失败: ${err.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.url) {
        setEditForm((prev) => ({ ...prev, imageUrl: data.url }));
        toast.success("图片上传成功");
      }
    } catch (err: any) {
      toast.error(`上传失败: ${err.message}`);
    } finally {
      setIsEditImageUploading(false);
      e.target.value = "";
    }
  };

  const addOption = () => {
    const labels = ["A", "B", "C", "D", "E", "F"];
    const nextLabel = labels[editOptions.length] || String(editOptions.length + 1);
    setEditOptions([...editOptions, { label: nextLabel, text: "" }]);
  };

  const removeOption = (index: number) => {
    setEditOptions(editOptions.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, text: string) => {
    const newOptions = [...editOptions];
    newOptions[index].text = text;
    setEditOptions(newOptions);
  };

  const toggleAnswer = (id: number) => {
    setShowAnswerMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGenerate = () => {
    if (generateMode === "text") {
      if (!genForm.topic.trim()) return;
      aiGenerate.mutate(genForm);
    } else {
      // 从文件出题
      if (genFiles.length === 0) {
        toast.error("请先上传文件");
        return;
      }
      aiGenerateFromUrls.mutate({
        urls: genFiles.map((f) => f.url),
        questionType: genForm.questionType,
        count: genForm.count,
        difficulty: genForm.difficulty,
        requireChemicalStructure: genForm.requireChemicalStructure,
        customInstructions: genForm.customInstructions,
      });
    }
  };

  const handleGenFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsGenUploading(true);
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
          toast.error(`上传失败: ${err.error || res.statusText}`);
          continue;
        }
        const data = await res.json();
        if (data.url) {
          setGenFiles((prev) => [...prev, { url: data.url, name: file.name }]);
          toast.success(`${file.name} 上传成功`);
        }
      } catch (err: any) {
        toast.error(`上传失败: ${err.message}`);
      }
    }
    setIsGenUploading(false);
    e.target.value = "";
  };

  const handleAddGenManualUrl = () => {
    const url = genManualUrl.trim();
    if (!url) return;
    if (!url.startsWith("http")) {
      toast.error("请输入有效的 http/https URL");
      return;
    }
    setGenFiles((prev) => [...prev, { url, name: url.split("/").pop() || "外部文件" }]);
    setGenManualUrl("");
  };

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
          toast.error(`上传失败: ${err.error || res.statusText}`);
          continue;
        }
        const data = await res.json();
        if (data.url) {
          setUploadedFiles((prev) => [...prev, { url: data.url, name: file.name }]);
          toast.success(`${file.name} 上传成功`);
        }
      } catch (err: any) {
        toast.error(`上传失败: ${err.message}`);
      }
    }
    setIsUploading(false);
    e.target.value = "";
  };

  const handleAddManualUrl = () => {
    const url = manualUrl.trim();
    if (!url) return;
    if (!url.startsWith("http")) {
      toast.error("请输入有效的 http/https URL");
      return;
    }
    setUploadedFiles((prev) => [...prev, { url, name: url.split("/").pop() || "外部文件" }]);
    setManualUrl("");
  };

  const handleRecognize = () => {
    if (uploadedFiles.length === 0) {
      toast.error("请先上传文件或添加文件URL");
      return;
    }
    recognizeFromUrls.mutate({
      urls: uploadedFiles.map((f) => f.url),
      questionType: recForm.questionType,
    });
  };

  const handleAnswer = () => {
    if (!currentQuestion || !userAnswer.trim()) return;
    submitAnswer.mutate({
      questionId: currentQuestion.id,
      userAnswer: userAnswer.trim(),
    });
  };

  const questionTypeMap: Record<string, string> = {
    single_choice: "单选题",
    multiple_choice: "多选题",
    fill_blank: "填空题",
    short_answer: "简答题",
    essay: "论述题",
    mixed: "混合",
  };

  const difficultyMap: Record<number, { label: string; color: string }> = {
    0: { label: "混合难度", color: "bg-purple-500/20 text-purple-400" },
    1: { label: "简单", color: "bg-green-500/20 text-green-400" },
    2: { label: "较易", color: "bg-emerald-500/20 text-emerald-400" },
    3: { label: "中等", color: "bg-yellow-500/20 text-yellow-400" },
    4: { label: "较难", color: "bg-orange-500/20 text-orange-400" },
    5: { label: "困难", color: "bg-red-500/20 text-red-400" },
  };

  // 旧的 renderLatexText 已废弃，使用 MathContent 组件替代

  const renderQuestionCard = (q: any, _showAnswer = true, selectable = false) => {
    const isShowingAnswer = showAnswerMap[q.id];
    return (
      <Card key={q.id} className="hover:border-primary/30 transition-colors">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex gap-2 flex-wrap items-center">
              {selectable && (
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={selectedQuestions.has(q.id)}
                  onChange={(e) => {
                    const next = new Set(selectedQuestions);
                    if (e.target.checked) next.add(q.id);
                    else next.delete(q.id);
                    setSelectedQuestions(next);
                  }}
                />
              )}
              <Badge className={difficultyMap[q.difficulty]?.color || ""}>
                {difficultyMap[q.difficulty]?.label || `难度${q.difficulty}`}
              </Badge>
              <Badge variant="outline">{questionTypeMap[q.questionType] || q.questionType}</Badge>
              {q.questionType === "multiple_choice" && (
                <Badge variant="secondary" className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                  多选
                </Badge>
              )}
              {q.aiGenerated && (
                <Badge variant="outline" className="bg-primary/10">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI
                </Badge>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-6 px-1.5"
                onClick={() => startEdit(q)}
              >
                <span className="text-xs">编辑</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-6 px-1.5"
                onClick={() => {
                  if (confirm("确定要删除这道题目吗？")) {
                    deleteQuestion.mutate({ id: q.id });
                  }
                }}
                disabled={deleteQuestion.isPending}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {q.imageUrl && (
            <div className="mb-3 p-2 rounded bg-secondary/30 border border-border text-center">
              <div className="text-xs text-muted-foreground mb-1">【图片】{q.imageUrl}</div>
              {(q.imageUrl.startsWith("http") || q.imageUrl.startsWith("/uploads/")) && (
                <img src={q.imageUrl} alt="题目图片" className="max-h-[200px] mx-auto rounded" />
              )}
            </div>
          )}
          {/* 学科和知识点标签 */}
          {(q.detectedSubject || q.detectedKnowledgePoint || q.subjectId || q.nodeId) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(q.detectedSubject || q.subjectId) && (
                <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                  <BookOpen className="h-3 w-3 mr-1" />
                  {subjectMap.get(q.subjectId)?.title || q.detectedSubject || "未分类学科"}
                </Badge>
              )}
              {(q.detectedKnowledgePoint || q.nodeId) && (
                <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {nodeMap.get(q.nodeId)?.title || q.detectedKnowledgePoint || "未分类知识点"}
                </Badge>
              )}
            </div>
          )}
          <MathContent content={q.content} className="text-sm font-medium mb-3" />
          {q.options && (
            <div className="space-y-1.5 mb-3">
              {(() => {
                try {
                  const opts = JSON.parse(q.options);
                  return opts.map((opt: any) => (
                    <div key={opt.label} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-primary">{opt.label}.</span>
                      <MathContent content={opt.text} />
                    </div>
                  ));
                } catch {
                  return null;
                }
              })()}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggleAnswer(q.id)}
              className="h-7 text-xs"
            >
              {isShowingAnswer ? "隐藏答案" : "显示答案"}
            </Button>
            {isShowingAnswer && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-green-400">答案：</span>
                {q.correctAnswer}
              </div>
            )}
          </div>
          {isShowingAnswer && q.explanation && (
            <div className="text-sm text-muted-foreground mt-2">
              <span className="font-medium">解析：</span>
              <MathContent content={q.explanation} />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileQuestion className="h-6 w-6 text-primary" />
            题库
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI针对知识点出题，自动评估掌握度，错误题目计入错题本
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRecognize(!showRecognize)}>
            <Upload className="h-4 w-4 mr-1" />
            文档识别
          </Button>
          <Button onClick={() => setShowGenerate(!showGenerate)}>
            <Plus className="h-4 w-4 mr-1" />
            AI出题
          </Button>
        </div>
      </div>

      {/* 编辑题目对话框 */}
      {editingQuestion && (
        <Card className="mb-6 border-primary/30 fixed inset-4 z-50 max-h-[90vh] overflow-auto">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <span>编辑题目</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">题目内容</label>
              <Textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                className="min-h-[100px]"
                placeholder="支持 LaTeX 公式，如 $E=mc^2$、$\\frac{a}{b}$、$$\\int_0^1 x dx$$"
              />
              {editForm.content && (
                <div className="mt-2 p-3 rounded-lg bg-secondary/30 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">预览：</p>
                  <MathContent content={editForm.content} />
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">选项</label>
              <div className="space-y-2">
                {editOptions.map((opt, index) => (
                  <div key={opt.label} className="flex items-center gap-2">
                    <span className="font-medium text-primary w-6">{opt.label}.</span>
                    <Input
                      value={opt.text}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`选项 ${opt.label}`}
                      className="flex-1"
                    />
                    {editOptions.length > 2 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeOption(index)}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {editOptions.length < 6 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addOption}
                  className="mt-2"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  添加选项
                </Button>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">正确答案</label>
              <Input
                value={editForm.correctAnswer}
                onChange={(e) => setEditForm({ ...editForm, correctAnswer: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">解析</label>
              <Textarea
                value={editForm.explanation}
                onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
                className="min-h-[60px]"
                placeholder="支持 LaTeX 公式"
              />
              {editForm.explanation && (
                <div className="mt-2 p-3 rounded-lg bg-secondary/30 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">预览：</p>
                  <MathContent content={editForm.explanation} />
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">题目图片</label>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleEditImageUpload}
                  disabled={isEditImageUploading}
                />
                {isEditImageUploading && (
                  <p className="text-xs text-muted-foreground">上传中...</p>
                )}
                {editForm.imageUrl && (
                  <div className="mt-2">
                    <img
                      src={editForm.imageUrl}
                      alt="题目图片"
                      className="max-h-[150px] rounded border"
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">难度</label>
              <Select
                value={String(editForm.difficulty)}
                onValueChange={(v) => setEditForm({ ...editForm, difficulty: parseInt(v) })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">混合难度</SelectItem>
                  <SelectItem value="1">简单</SelectItem>
                  <SelectItem value="2">较易</SelectItem>
                  <SelectItem value="3">中等</SelectItem>
                  <SelectItem value="4">较难</SelectItem>
                  <SelectItem value="5">困难</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpdate} disabled={updateQuestion.isPending} className="flex-1">
                {updateQuestion.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                保存
              </Button>
              <Button variant="outline" onClick={() => setEditingQuestion(null)} className="flex-1">
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 创建试卷对话框 */}
      {showCreatePaper && (
        <Card className="mb-6 border-primary/30 fixed inset-4 z-50 max-h-[90vh] overflow-auto">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              创建试卷
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">试卷名称</label>
              <Input
                value={paperForm.title}
                onChange={(e) => setPaperForm({ ...paperForm, title: e.target.value })}
                placeholder="例如：第一章综合测试"
              />
            </div>
            <div>
              <label className="text-sm font-medium">描述（可选）</label>
              <Textarea
                value={paperForm.description}
                onChange={(e) => setPaperForm({ ...paperForm, description: e.target.value })}
                placeholder="试卷说明或备注..."
                className="min-h-[60px]"
              />
            </div>
            <div>
              <label className="text-sm font-medium">考试时限（分钟）</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={10}
                  max={300}
                  value={paperForm.timeLimit}
                  onChange={(e) => setPaperForm({ ...paperForm, timeLimit: parseInt(e.target.value) || 60 })}
                />
                <span className="text-sm text-muted-foreground">分钟</span>
              </div>
            </div>

            {/* 选择题库题目 */}
            <div>
              <label className="text-sm font-medium flex items-center justify-between">
                <span>选择题库题目（已选 {selectedPaperQuestions.size} 题）</span>
                <span className="text-xs text-muted-foreground">题库共 {questionList?.length || 0} 题</span>
              </label>
              <div className="mt-2 border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                {questionList?.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    题库暂无题目
                  </div>
                ) : (
                  <div className="divide-y">
                    {questionList?.map((q: any) => (
                      <div
                        key={q.id}
                        className={`p-3 flex items-start gap-3 cursor-pointer hover:bg-secondary/30 transition-colors ${
                          selectedPaperQuestions.has(q.id) ? "bg-primary/5" : ""
                        }`}
                        onClick={() => {
                          const newSet = new Set(selectedPaperQuestions);
                          if (newSet.has(q.id)) {
                            newSet.delete(q.id);
                          } else {
                            newSet.add(q.id);
                          }
                          setSelectedPaperQuestions(newSet);
                        }}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 mt-0.5 rounded border-border"
                          checked={selectedPaperQuestions.has(q.id)}
                          onChange={() => {}}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate"><MathContent content={q.content} /></p>
                          <div className="flex gap-1 mt-1">
                            <Badge variant="outline" className="text-[10px]">
                              {questionTypeMap[q.questionType]}
                            </Badge>
                            <Badge className={`text-[10px] ${difficultyMap[q.difficulty]?.color || ""}`}>
                              {difficultyMap[q.difficulty]?.label}
                            </Badge>
                          </div>
                        </div>
                        {selectedPaperQuestions.has(q.id) && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">分数</span>
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              value={questionScores[q.id] || 10}
                              onChange={(e) => {
                                const score = parseInt(e.target.value) || 10;
                                setQuestionScores({ ...questionScores, [q.id]: score });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-16 h-7 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 显示已选题目总分预览 */}
            {selectedPaperQuestions.size > 0 && (
              <div className="bg-secondary/30 p-3 rounded-lg">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">已选 {selectedPaperQuestions.size} 题</span>
                  <span className="font-medium">
                    预计总分：{
                      Array.from(selectedPaperQuestions).reduce((sum, id) => sum + (questionScores[id] || 10), 0)
                    } 分
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (!paperForm.title.trim()) {
                    toast.error("请输入试卷名称");
                    return;
                  }
                  if (selectedPaperQuestions.size === 0) {
                    toast.error("请至少选择一道题目");
                    return;
                  }
                  // 构建分数对象
                  const scores: Record<number, number> = {};
                  selectedPaperQuestions.forEach((id) => {
                    scores[id] = questionScores[id] || 10;
                  });
                  createPaper.mutate({
                    title: paperForm.title,
                    description: paperForm.description,
                    questionIds: Array.from(selectedPaperQuestions),
                    questionScores: scores,
                    timeLimit: paperForm.timeLimit,
                  });
                }}
                disabled={createPaper.isPending || selectedPaperQuestions.size === 0}
                className="flex-1"
              >
                {createPaper.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                创建试卷
              </Button>
              <Button variant="outline" onClick={() => {
                setShowCreatePaper(false);
                setQuestionScores({});
              }} className="flex-1">
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 text-center">
              <Trophy className="h-5 w-5 text-yellow-400 mx-auto mb-1" />
              <p className="text-2xl font-bold">{stats.totalQuestions}</p>
              <p className="text-xs text-muted-foreground">总答题数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <CheckCircle className="h-5 w-5 text-green-400 mx-auto mb-1" />
              <p className="text-2xl font-bold">{stats.accuracy}%</p>
              <p className="text-xs text-muted-foreground">正确率</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <AlertTriangle className="h-5 w-5 text-red-400 mx-auto mb-1" />
              <p className="text-2xl font-bold">{stats.wrongCount}</p>
              <p className="text-xs text-muted-foreground">待复习错题</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <BookOpen className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-2xl font-bold">{stats.avgScore}</p>
              <p className="text-xs text-muted-foreground">平均分</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI出题面板 */}
      {showGenerate && (
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI出题
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 出题模式切换 */}
            <div className="flex gap-2 p-2 rounded-lg bg-secondary/30 border border-border">
              <button
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                  generateMode === "text"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setGenerateMode("text")}
              >
                基于文本出题
              </button>
              <button
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                  generateMode === "file"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setGenerateMode("file")}
              >
                基于文件出题
              </button>
            </div>

            {generateMode === "text" ? (
              <>
                <div>
                  <label className="text-sm font-medium">知识点/主题</label>
                  <Input
                    placeholder="如：微积分导数、Java多线程"
                    value={genForm.topic}
                    onChange={(e) => setGenForm({ ...genForm, topic: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">知识点内容（可选）</label>
                  <Textarea
                    placeholder="粘贴相关知识点内容"
                    value={genForm.knowledgeContent}
                    onChange={(e) => setGenForm({ ...genForm, knowledgeContent: e.target.value })}
                    className="min-h-[80px]"
                  />
                </div>
              </>
            ) : (
              <>
                {/* 文件上传 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">上传学习材料</label>
                  <div className="flex items-center gap-2">
                    <label className="flex-1">
                      <Input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                        onChange={handleGenFileUpload}
                        disabled={isGenUploading}
                      />
                    </label>
                    {isGenUploading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    上传学习材料（PDF、Word、图片等），AI将基于材料内容出题
                  </p>
                </div>

                {/* 手动添加URL */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Link className="h-3.5 w-3.5" />
                    或添加文件URL
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.com/file.pdf"
                      value={genManualUrl}
                      onChange={(e) => setGenManualUrl(e.target.value)}
                    />
                    <Button variant="outline" onClick={handleAddGenManualUrl}>添加</Button>
                  </div>
                </div>

                {/* 已上传文件列表 */}
                {genFiles.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">已添加的文件 ({genFiles.length})</label>
                    <div className="space-y-1">
                      {genFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded bg-secondary/30 border border-border">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{file.name}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-red-400"
                            onClick={() => setGenFiles((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="text-sm font-medium">出题要求（可选）</label>
              <Textarea
                placeholder="如：偏向考研真题风格、注重计算能力、增加案例分析题、只出选择题..."
                value={genForm.customInstructions}
                onChange={(e) => setGenForm({ ...genForm, customInstructions: e.target.value })}
                className="min-h-[60px]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">题型</label>
                <Select
                  value={genForm.questionType}
                  onValueChange={(v) => setGenForm({ ...genForm, questionType: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_choice">单选题</SelectItem>
                    <SelectItem value="multiple_choice">多选题</SelectItem>
                    <SelectItem value="fill_blank">填空题</SelectItem>
                    <SelectItem value="short_answer">简答题</SelectItem>
                    <SelectItem value="mixed">混合题型</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">数量</label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={genForm.count}
                  onChange={(e) => setGenForm({ ...genForm, count: parseInt(e.target.value) || 5 })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">难度</label>
                <Select
                  value={String(genForm.difficulty)}
                  onValueChange={(v) => setGenForm({ ...genForm, difficulty: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">简单</SelectItem>
                    <SelectItem value="2">较易</SelectItem>
                    <SelectItem value="3">中等</SelectItem>
                    <SelectItem value="4">较难</SelectItem>
                    <SelectItem value="5">困难</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="require-chem"
                checked={genForm.requireChemicalStructure}
                onCheckedChange={(checked) =>
                  setGenForm({ ...genForm, requireChemicalStructure: checked === true })
                }
              />
              <label htmlFor="require-chem" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
                <FlaskConical className="h-3.5 w-3.5" />
                需要化学结构式（键线式）
              </label>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={
                (generateMode === "text" && aiGenerate.isPending) ||
                (generateMode === "file" && aiGenerateFromUrls.isPending)
              }
              className="w-full"
            >
              {(generateMode === "text" && aiGenerate.isPending) || (generateMode === "file" && aiGenerateFromUrls.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              生成题目
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 文档识别面板 */}
      {showRecognize && (
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              文档识别出题
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 文件上传 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">上传文件</label>
              <div className="flex items-center gap-2">
                <label className="flex-1">
                  <Input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </label>
                {isUploading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground">
                支持 PDF、Word、TXT、PNG、JPG。文件将上传到你配置的文件服务器供AI读取。
              </p>
            </div>

            {/* 手动添加URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Link className="h-3.5 w-3.5" />
                或手动添加文件URL
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/file.pdf"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                />
                <Button variant="outline" onClick={handleAddManualUrl}>添加</Button>
              </div>
            </div>

            {/* 已上传文件列表 */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">已添加的文件 ({uploadedFiles.length})</label>
                <div className="space-y-1">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-secondary/30 border border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{file.name}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-400"
                        onClick={() => setUploadedFiles((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 识别参数 */}
            <div>
              <label className="text-sm font-medium">题型</label>
              <Select
                value={recForm.questionType}
                onValueChange={(v) => setRecForm({ ...recForm, questionType: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_choice">单选题</SelectItem>
                  <SelectItem value="multiple_choice">多选题</SelectItem>
                  <SelectItem value="fill_blank">填空题</SelectItem>
                  <SelectItem value="short_answer">简答题</SelectItem>
                  <SelectItem value="mixed">混合题型</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                AI 会自动识别文档中所有符合条件的题目，并判断每道题的难度
              </p>
            </div>

            <Button
              onClick={handleRecognize}
              disabled={recognizeFromUrls.isPending || uploadedFiles.length === 0}
              className="w-full"
            >
              {recognizeFromUrls.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              开始识别
            </Button>

            {/* 识别结果预览 */}
            {recognizedQuestions.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-border">
                <p className="text-sm font-medium">识别结果预览（已自动保存到题库）</p>
                {recognizedQuestions.map((q, idx) => (
                  <Card key={idx} className="border-border/50">
                    <CardContent className="pt-4">
                      <div className="flex gap-2 mb-2 flex-wrap">
                        <Badge variant="outline">{questionTypeMap[q.questionType] || q.questionType}</Badge>
                        <Badge className={difficultyMap[q.difficulty]?.color || ""}>{difficultyMap[q.difficulty]?.label || `难度${q.difficulty}`}</Badge>
                        {q.questionType === "multiple_choice" && (
                          <Badge variant="secondary" className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                            多选
                          </Badge>
                        )}
                        {(q.detectedSubject || q.subjectId) && (
                          <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                            <BookOpen className="h-3 w-3 mr-1" />
                            {subjectMap.get(q.subjectId)?.title || q.detectedSubject || "未知学科"}
                          </Badge>
                        )}
                        {(q.detectedKnowledgePoint || q.nodeId) && (
                          <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                            <Sparkles className="h-3 w-3 mr-1" />
                            {nodeMap.get(q.nodeId)?.title || q.detectedKnowledgePoint || "未知知识点"}
                          </Badge>
                        )}
                      </div>
                      <MathContent content={q.content} className="text-sm font-medium mb-2" />
                      {q.options && (
                        <div className="space-y-1 mb-2">
                          {(() => {
                            try {
                              const opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
                              return opts.map((opt: any) => (
                                <div key={opt.label} className="flex items-center gap-2 text-sm">
                                  <span className="font-medium text-primary">{opt.label}.</span>
                                  <MathContent content={opt.text} />
                                </div>
                              ));
                            } catch {
                              return null;
                            }
                          })()}
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-green-400">答案：</span>{q.correctAnswer}
                      </div>
                      {q.explanation && (
                        <div className="text-sm text-muted-foreground mt-1">
                          <span className="font-medium">解析：</span>
                          <MathContent content={q.explanation} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 答题界面 */}
      {currentQuestion && (
        <Card className="mb-6 border-primary/50">
          <CardHeader>
            <CardTitle className="text-sm">答题</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 mb-2">
              <Badge className={difficultyMap[currentQuestion.difficulty]?.color || ""}>
                {difficultyMap[currentQuestion.difficulty]?.label || `难度${currentQuestion.difficulty}`}
              </Badge>
              <Badge variant="outline">{questionTypeMap[currentQuestion.questionType]}</Badge>
            </div>
            {currentQuestion.imageUrl && (
              <div className="p-2 rounded bg-secondary/30 border border-border text-center">
                <div className="text-xs text-muted-foreground mb-1">【图片】{currentQuestion.imageUrl}</div>
                {(currentQuestion.imageUrl.startsWith("http") || currentQuestion.imageUrl.startsWith("/uploads/")) && (
                  <img src={currentQuestion.imageUrl} alt="题目图片" className="max-h-[200px] mx-auto rounded" />
                )}
              </div>
            )}
            <MathContent content={currentQuestion.content} className="font-medium" />
            {currentQuestion.questionType === "multiple_choice" && (
              <p className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                <span className="inline-flex items-center justify-center w-4 h-4 border border-amber-400 rounded text-[10px]">✓</span>
                多选题：可选择多个答案
              </p>
            )}
            {currentQuestion.options && (
              <div className="space-y-2">
                {(() => {
                  try {
                    const opts = JSON.parse(currentQuestion.options);
                    const isMultiple = currentQuestion.questionType === "multiple_choice";
                    // 多选题答案解析为数组
                    const selectedLabels = isMultiple
                      ? userAnswer.split("").filter(Boolean)
                      : [userAnswer].filter(Boolean);

                    const toggleOption = (label: string) => {
                      if (isMultiple) {
                        // 多选题：切换选中状态
                        const newLabels = selectedLabels.includes(label)
                          ? selectedLabels.filter((l) => l !== label)
                          : [...selectedLabels, label].sort();
                        setUserAnswer(newLabels.join(""));
                      } else {
                        // 单选题：直接替换
                        setUserAnswer(label);
                      }
                    };

                    return opts.map((opt: any) => {
                      const isSelected = selectedLabels.includes(opt.label);
                      return (
                        <button
                          key={opt.label}
                          onClick={() => toggleOption(opt.label)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
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
                    });
                  } catch {
                    return null;
                  }
                })()}
              </div>
            )}
            {!currentQuestion.options && (
              <Textarea
                placeholder="请输入你的答案"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
              />
            )}
            <div className="flex gap-2">
              <Button onClick={handleAnswer} disabled={submitAnswer.isPending || !userAnswer}>
                {submitAnswer.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                提交答案
              </Button>
              <Button variant="outline" onClick={() => { setCurrentQuestion(null); setUserAnswer(""); setAnswerResult(null); }}>
                取消
              </Button>
            </div>

            {answerResult && (
              <div className={`p-4 rounded-lg ${answerResult.isCorrect ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {answerResult.isCorrect ? (
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-400" />
                  )}
                  <span className="font-medium">
                    {answerResult.isCorrect ? "回答正确！" : "回答错误"}
                  </span>
                  <Badge variant="outline">得分 {answerResult.score}</Badge>
                  <Badge variant="outline">掌握度 {answerResult.mastery}%</Badge>
                </div>
                <p className="text-sm">{answerResult.feedback}</p>
                {answerResult.explanation && (
                  <p className="text-sm text-muted-foreground mt-2">
                    <span className="font-medium">解析：</span>
                    <MathContent content={answerResult.explanation} />
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 题目列表/错题本/试卷 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">全部题目</TabsTrigger>
          <TabsTrigger value="wrong">错题本</TabsTrigger>
          <TabsTrigger value="papers">我的试卷</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !questionList || questionList.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <FileQuestion className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">暂无题目</h3>
                <p className="text-muted-foreground mb-4">使用AI出题功能创建题目</p>
                <Button onClick={() => setShowGenerate(true)}>
                  <Sparkles className="h-4 w-4 mr-1" />
                  AI出题
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* 批量操作栏 */}
              <div className="flex items-center gap-2 p-2 rounded bg-secondary/30 border border-border">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={questionList.length > 0 && selectedQuestions.size === questionList.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedQuestions(new Set(questionList.map((q: any) => q.id)));
                    } else {
                      setSelectedQuestions(new Set());
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  已选 {selectedQuestions.size} / {questionList.length}
                </span>
                {selectedQuestions.size > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={() => {
                      if (confirm(`确定要删除选中的 ${selectedQuestions.size} 道题目吗？`)) {
                        deleteManyQuestions.mutate({ ids: Array.from(selectedQuestions) });
                      }
                    }}
                    disabled={deleteManyQuestions.isPending}
                  >
                    {deleteManyQuestions.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
                    批量删除
                  </Button>
                )}
              </div>
              {questionList.map((q) => (
                <div key={q.id} className="relative">
                  {renderQuestionCard(q, true, true)}
                  <Button
                    size="sm"
                    className="absolute top-3 right-10"
                    onClick={() => {
                      setCurrentQuestion(q);
                      setUserAnswer("");
                      setAnswerResult(null);
                    }}
                  >
                    答题
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="wrong" className="mt-4">
          {!wrongAnswers || wrongAnswers.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">太棒了！暂无错题</h3>
                <p className="text-muted-foreground">继续保持，所有题目都掌握了</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {wrongAnswers.map((w: any) => (
                <Card key={w.id} className="border-red-500/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex gap-2">
                        <Badge variant="outline" className="bg-red-500/10 text-red-400">
                          错误{w.wrongCount}次
                        </Badge>
                        {w.mastered && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-400">
                            已掌握
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {!w.mastered && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markMastered.mutate({ id: w.id })}
                          >
                            <CheckCircle className="h-4 w-4 text-green-400" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (w.question) {
                              setCurrentQuestion(w.question);
                              setUserAnswer("");
                              setAnswerResult(null);
                            }
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => {
                            if (confirm("确定删除这条错题记录？")) {
                              deleteWrongAnswer.mutate({ id: w.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {w.question && (
                      <>
                        <MathContent content={w.question.content} className="text-sm font-medium mb-2" />
                        <div className="text-sm text-muted-foreground">
                          <span className="text-red-400">你的答案：</span>
                          {w.userAnswer}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          <span className="text-green-400">正确答案：</span>
                          {w.question.correctAnswer}
                        </div>
                        {w.question.explanation && (
                          <p className="text-sm text-muted-foreground mt-2">
                            <span className="font-medium">解析：</span>
                            <MathContent content={w.question.explanation} />
                          </p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 试卷标签页 */}
        <TabsContent value="papers" className="mt-4">
          <div className="space-y-4">
            {/* 创建试卷按钮 */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                共 {examPapers?.length || 0} 份试卷
              </p>
              <Button
                onClick={() => {
                  setShowCreatePaper(true);
                  setSelectedPaperQuestions(new Set());
                }}
              >
                <FolderOpen className="h-4 w-4 mr-1" />
                从选择题库组卷
              </Button>
            </div>

            {/* 试卷列表 */}
            {!examPapers || examPapers.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">暂无试卷</h3>
                  <p className="text-muted-foreground mb-4">从题库中选择题目组卷</p>
                  <Button onClick={() => setActiveTab("all")}>
                    <BookOpen className="h-4 w-4 mr-1" />
                    浏览题库
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {examPapers.map((paper: any) => (
                  <Card key={paper.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-medium">{paper.title}</h3>
                          {paper.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{paper.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-primary hover:text-primary hover:bg-primary/10 h-8 w-8 p-0"
                            onClick={() => {
                              setViewingPaper(paper);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                            onClick={() => {
                              if (confirm("确定要删除这份试卷吗？")) {
                                deletePaper.mutate({ id: paper.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Badge variant="outline" className="text-xs">
                          {paper.totalQuestions} 题
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          总分 {paper.totalScore}
                        </Badge>
                        {paper.timeLimit && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {paper.timeLimit} 分钟
                          </Badge>
                        )}
                        {paper.aiAnalysis && (
                          <Badge variant="secondary" className="text-xs flex items-center gap-1">
                            <BrainCircuit className="h-3 w-3" />
                            已分析
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs flex-1"
                          onClick={() => {
                            setAnalyzingPaperId(paper.id);
                            analyzePaper.mutate({ id: paper.id });
                          }}
                          disabled={analyzingPaperId === paper.id || analyzePaper.isPending}
                        >
                          {analyzingPaperId === paper.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <BrainCircuit className="h-3 w-3 mr-1" />
                          )}
                          {paper.aiAnalysis ? "重新分析" : "AI 分析"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        创建于 {new Date(paper.createdAt).toLocaleDateString("zh-CN")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* 试卷详情对话框 */}
      {viewingPaper && (
        <Card className="fixed inset-4 z-50 max-h-[90vh] overflow-auto">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              试卷详情
            </CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => {
                setViewingPaper(null);
                setPaperDetailData(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 试卷基本信息 */}
            <div className="bg-secondary/30 p-4 rounded-lg">
              <h3 className="font-medium text-lg">{viewingPaper.title}</h3>
              {viewingPaper.description && (
                <p className="text-sm text-muted-foreground mt-1">{viewingPaper.description}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="outline">{viewingPaper.totalQuestions} 题</Badge>
                <Badge variant="outline">总分 {viewingPaper.totalScore}</Badge>
                {viewingPaper.timeLimit && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {viewingPaper.timeLimit} 分钟
                  </Badge>
                )}
              </div>
            </div>

            {/* AI 分析结果 */}
            {viewingPaper.aiAnalysis && (
              <div className="border rounded-lg p-4">
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  AI 分析报告
                </h4>
                {(() => {
                  try {
                    const analysis = JSON.parse(viewingPaper.aiAnalysis);
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-4">
                          <div>
                            <span className="text-sm text-muted-foreground">综合难度</span>
                            <div className="font-medium">{analysis.overallDifficulty}/5</div>
                          </div>
                          <div className="flex-1">
                            <span className="text-sm text-muted-foreground">难度分布</span>
                            <div className="flex gap-2 mt-1">
                              <Badge variant="outline" className="text-xs bg-green-500/10">
                                简单 {analysis.difficultyDistribution?.easy || 0}%
                              </Badge>
                              <Badge variant="outline" className="text-xs bg-yellow-500/10">
                                中等 {analysis.difficultyDistribution?.medium || 0}%
                              </Badge>
                              <Badge variant="outline" className="text-xs bg-red-500/10">
                                困难 {analysis.difficultyDistribution?.hard || 0}%
                              </Badge>
                            </div>
                          </div>
                        </div>
                        {/* 关联的本地学科 - 类似题目卡片的样式 */}
                        {analysis.matchedSubjects && analysis.matchedSubjects.length > 0 && (
                          <div>
                            <span className="text-sm text-muted-foreground">关联学科</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {analysis.matchedSubjects.map((sub: any, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                                  <BookOpen className="h-3 w-3 mr-1" />
                                  {sub.title}
                                  {sub.relevanceScore && (
                                    <span className="ml-1 opacity-75">({sub.relevanceScore}%)</span>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 关联的本地知识点 - 类似题目卡片的样式 */}
                        {analysis.matchedNodes && analysis.matchedNodes.length > 0 && (
                          <div>
                            <span className="text-sm text-muted-foreground">考察知识点</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {analysis.matchedNodes.map((node: any, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  {node.title}
                                  {node.questionCount > 1 && (
                                    <span className="ml-1 opacity-75">({node.questionCount}题)</span>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 其他未匹配到的知识点 */}
                        {analysis.otherKnowledgePoints && analysis.otherKnowledgePoints.length > 0 && (
                          <div>
                            <span className="text-sm text-muted-foreground">其他涉及内容</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {analysis.otherKnowledgePoints.map((kp: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {kp}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  } catch {
                    return <p className="text-sm text-muted-foreground">分析数据解析失败</p>;
                  }
                })()}
              </div>
            )}

            {/* 题目列表 */}
            <div>
              <h4 className="font-medium mb-3">题目列表</h4>
              {paperDetailData?.questions?.length > 0 ? (
                <div className="space-y-3">
                  {paperDetailData.questions.map((q: any, idx: number) => (
                    <Card key={q.id} className="bg-secondary/20">
                      <CardContent className="py-3">
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-medium text-primary">{idx + 1}.</span>
                          <div className="flex-1">
                            <MathContent content={q.content} className="text-sm" />
                            {q.options && (
                              <div className="mt-2 space-y-1">
                                {(() => {
                                  try {
                                    const opts = JSON.parse(q.options);
                                    return opts.map((opt: any) => (
                                      <div key={opt.label} className="text-sm text-muted-foreground">
                                        {opt.label}. {opt.text}
                                      </div>
                                    ));
                                  } catch {
                                    return null;
                                  }
                                })()}
                              </div>
                            )}
                            <div className="flex gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                答案: {q.correctAnswer}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {difficultyMap[q.difficulty]?.label}
                              </Badge>
                              {paperDetailData.paper?.questionScores && (() => {
                                try {
                                  const scores = JSON.parse(paperDetailData.paper.questionScores);
                                  return scores[q.id] ? (
                                    <Badge variant="secondary" className="text-xs">
                                      {scores[q.id]} 分
                                    </Badge>
                                  ) : null;
                                } catch {
                                  return null;
                                }
                              })()}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">加载题目中...</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setViewingPaper(null);
                  setPaperDetailData(null);
                }}
              >
                关闭
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
