import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

  const { data: settings } = trpc.settings.get.useQuery();

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
      setGenForm({ topic: "", knowledgeContent: "", questionType: "single_choice", count: 5, difficulty: 3 });
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
      });
    }
  };

  const handleGenFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileServerUrl = settings?.fileServerUrl?.trim();
    if (!fileServerUrl) {
      toast.error("请先在设置中配置文件上传服务器地址");
      return;
    }

    setIsGenUploading(true);
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
    1: { label: "简单", color: "bg-green-500/20 text-green-400" },
    2: { label: "较易", color: "bg-emerald-500/20 text-emerald-400" },
    3: { label: "中等", color: "bg-yellow-500/20 text-yellow-400" },
    4: { label: "较难", color: "bg-orange-500/20 text-orange-400" },
    5: { label: "困难", color: "bg-red-500/20 text-red-400" },
  };

  const renderLatexText = (text: string) => {
    if (!text) return text;
    // 处理 \dot{x} 格式，转换为带点的字符
    let processed = text
      .replace(/\\dot\{(.)\}/g, '<span class="border-b border-current">$1̇</span>')
      .replace(/\\frac\{(.*?)\}\{(.*?)\}/g, '($1/$2)')
      .replace(/\\sqrt\{(.*?)\}/g, '√($1)')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\neq/g, '≠')
      .replace(/\\le/g, '≤')
      .replace(/\\ge/g, '≥')
      .replace(/\\infty/g, '∞')
      .replace(/\\pi/g, 'π')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\theta/g, 'θ')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\sum/g, 'Σ')
      .replace(/\\int/g, '∫')
      .replace(/\\to/g, '→')
      .replace(/\\rightarrow/g, '→')
      .replace(/\\leftarrow/g, '←')
      .replace(/\\cdot/g, '·')
      .replace(/\\dots/g, '…')
      .replace(/\\ldots/g, '…')
      .replace(/\\cdots/g, '⋯');
    return <span dangerouslySetInnerHTML={{ __html: processed }} />;
  };

  const renderQuestionCard = (q: any, showAnswer = true, selectable = false) => (
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
            {q.aiGenerated && (
              <Badge variant="outline" className="bg-primary/10">
                <Sparkles className="h-3 w-3 mr-1" />
                AI
              </Badge>
            )}
          </div>
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
        {q.imageUrl && (
          <div className="mb-3 p-2 rounded bg-secondary/30 border border-border text-center">
            <div className="text-xs text-muted-foreground mb-1">【图片】{q.imageUrl}</div>
            {(q.imageUrl.startsWith("http") || q.imageUrl.startsWith("/uploads/")) && (
              <img src={q.imageUrl} alt="题目图片" className="max-h-[200px] mx-auto rounded" />
            )}
          </div>
        )}
        <p className="text-sm font-medium mb-3">{q.content}</p>
        {q.options && (
          <div className="space-y-1.5 mb-3">
            {(() => {
              try {
                const opts = JSON.parse(q.options);
                return opts.map((opt: any) => (
                  <div key={opt.label} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-primary">{opt.label}.</span>
                    <span>{renderLatexText(opt.text)}</span>
                  </div>
                ));
              } catch {
                return null;
              }
            })()}
          </div>
        )}
        {showAnswer && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-green-400">答案：</span>
            {q.correctAnswer}
          </div>
        )}
        {q.explanation && (
          <div className="text-sm text-muted-foreground mt-2">
            <span className="font-medium">解析：</span>
            {q.explanation}
          </div>
        )}
      </CardContent>
    </Card>
  );

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
                      <div className="flex gap-2 mb-2">
                        <Badge variant="outline">{questionTypeMap[q.questionType] || q.questionType}</Badge>
                        <Badge className={difficultyMap[q.difficulty]?.color || ""}>{difficultyMap[q.difficulty]?.label || `难度${q.difficulty}`}</Badge>
                      </div>
                      <p className="text-sm font-medium mb-2">{q.content}</p>
                      {q.options && (
                        <div className="space-y-1 mb-2">
                          {(() => {
                            try {
                              const opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
                              return opts.map((opt: any) => (
                                <div key={opt.label} className="flex items-center gap-2 text-sm">
                                  <span className="font-medium text-primary">{opt.label}.</span>
                                  {renderLatexText(opt.text)}
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
                          <span className="font-medium">解析：</span>{q.explanation}
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
            <p className="font-medium">{currentQuestion.content}</p>
            {currentQuestion.options && (
              <div className="space-y-2">
                {(() => {
                  try {
                    const opts = JSON.parse(currentQuestion.options);
                    return opts.map((opt: any) => (
                      <button
                        key={opt.label}
                        onClick={() => setUserAnswer(opt.label)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          userAnswer === opt.label
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-secondary/30"
                        }`}
                      >
                        <span className="font-medium text-primary mr-2">{opt.label}.</span>
                        {renderLatexText(opt.text)}
                      </button>
                    ));
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
                    {answerResult.explanation}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 题目列表/错题本 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">全部题目</TabsTrigger>
          <TabsTrigger value="wrong">错题本</TabsTrigger>
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
                      </div>
                    </div>
                    {w.question && (
                      <>
                        <p className="text-sm font-medium mb-2">{w.question.content}</p>
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
                            {w.question.explanation}
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
      </Tabs>
    </div>
  );
}
