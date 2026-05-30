import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Plus,
  Sparkles,
  Trash2,
  Loader2,
  FileText,
  GraduationCap,
  Newspaper,
  MoreHorizontal,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

const sourceTypeIcons: Record<string, React.ReactNode> = {
  book: <BookOpen className="h-4 w-4" />,
  course: <GraduationCap className="h-4 w-4" />,
  article: <Newspaper className="h-4 w-4" />,
  manual: <FileText className="h-4 w-4" />,
  other: <MoreHorizontal className="h-4 w-4" />,
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  imported: { label: "已导入", color: "bg-blue-500/20 text-blue-400", icon: <CheckCircle2 className="h-3 w-3" /> },
  analyzing: { label: "分析中", color: "bg-yellow-500/20 text-yellow-400", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  analyzed: { label: "已分析", color: "bg-green-500/20 text-green-400", icon: <Sparkles className="h-3 w-3" /> },
  error: { label: "错误", color: "bg-red-500/20 text-red-400", icon: <AlertCircle className="h-3 w-3" /> },
};

export default function Subjects() {
  const { isAuthenticated } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  const utils = trpc.useUtils();
  const { data: subjects, isLoading } = trpc.subject.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createSubject = trpc.subject.create.useMutation({
    onSuccess: () => {
      utils.subject.list.invalidate();
      toast.success("科目创建成功");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteSubject = trpc.subject.delete.useMutation({
    onSuccess: () => {
      utils.subject.list.invalidate();
      toast.success("科目已删除");
    },
    onError: (err) => toast.error(err.message),
  });

  const analyzeSubject = trpc.subject.analyze.useMutation({
    onSuccess: (data) => {
      utils.subject.list.invalidate();
      toast.success(`AI分析完成！生成 ${data.nodesCount} 个知识点, ${data.skillsCount} 个技能维度`);
      setAnalyzingId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setAnalyzingId(null);
    },
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  // 表单状态
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    sourceType: "other" as "book" | "course" | "article" | "manual" | "other",
    sourceContent: "",
    difficulty: 3,
    priority: 2,
    color: "#3b82f6",
  });

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      category: "",
      sourceType: "other",
      sourceContent: "",
      difficulty: 3,
      priority: 2,
      color: "#3b82f6",
    });
  };

  const handleCreate = () => {
    if (!form.title.trim()) {
      toast.error("请输入科目名称");
      return;
    }
    createSubject.mutate(form);
  };

  const handleAnalyze = (id: number) => {
    setAnalyzingId(id);
    analyzeSubject.mutate({ id });
  };

  const colors = [
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
    "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold glow-text">科目管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            导入学习科目或书籍，AI将自动分析生成知识树和技能维度
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              导入科目
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                导入新科目
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">科目名称 *</label>
                    <Input
                      placeholder="例如：高等数学、Python编程..."
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">分类</label>
                    <Input
                      placeholder="例如：数学、编程、语言..."
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">描述</label>
                  <Input
                    placeholder="简短描述这个科目的内容..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">来源类型</label>
                    <Select
                      value={form.sourceType}
                      onValueChange={(v) =>
                        setForm({ ...form, sourceType: v as typeof form.sourceType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="book">书籍</SelectItem>
                        <SelectItem value="course">课程</SelectItem>
                        <SelectItem value="article">文章</SelectItem>
                        <SelectItem value="manual">手册/文档</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">难度 (1-5)</label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={form.difficulty}
                      onChange={(e) =>
                        setForm({ ...form, difficulty: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">优先级 (1-5)</label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={form.priority}
                      onChange={(e) =>
                        setForm({ ...form, priority: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">主题色</label>
                  <div className="flex gap-2">
                    {colors.map((c) => (
                      <button
                        key={c}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          form.color === c
                            ? "border-white scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: c }}
                        onClick={() => setForm({ ...form, color: c })}
                      />
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    内容文本（用于AI分析）
                  </label>
                  <p className="text-xs text-muted-foreground">
                    粘贴书籍目录、课程大纲或学习内容的文本，AI将自动分析并生成知识树和技能维度
                  </p>
                  <Textarea
                    placeholder="粘贴内容目录或学习大纲...

例如：
第一章 函数与极限
  1.1 函数的概念
  1.2 数列的极限
  1.3 函数的极限
第二章 导数与微分
  2.1 导数的概念
  2.2 求导法则
..."
                    value={form.sourceContent}
                    onChange={(e) => setForm({ ...form, sourceContent: e.target.value })}
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={createSubject.isPending}
                className="gap-2"
              >
                {createSubject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                创建科目
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 科目列表 */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-secondary/50" />
          ))}
        </div>
      ) : subjects && subjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subjects.map((subject) => {
            const status = statusConfig[subject.status] || statusConfig.imported;
            return (
              <Card
                key={subject.id}
                className="glass glow-card border-border/50 hover:border-primary/30 transition-all group"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${subject.color || "#3b82f6"}20` }}
                      >
                        {sourceTypeIcons[subject.sourceType] || sourceTypeIcons.other}
                      </div>
                      <div>
                        <h3 className="font-semibold">{subject.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className={`text-[10px] gap-1 ${status.color}`}>
                            {status.icon}
                            {status.label}
                          </Badge>
                          {subject.category && (
                            <span className="text-xs text-muted-foreground">
                              {subject.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {subject.status === "imported" && subject.sourceContent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() => handleAnalyze(subject.id)}
                          disabled={analyzingId === subject.id}
                        >
                          {analyzingId === subject.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          AI分析
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          if (confirm("确定删除这个科目吗？所有关联的知识树和技能数据也会被删除。")) {
                            deleteSubject.mutate({ id: subject.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        进度
                      </span>
                      <span className="font-medium">{subject.progress || 0}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${subject.progress || 0}%`,
                          backgroundColor: subject.color || "#3b82f6",
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>难度: {"★".repeat(subject.difficulty)}</span>
                      <span>优先级: {"★".repeat(subject.priority)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">还没有科目</p>
            <p className="text-sm text-muted-foreground mt-1">
              点击右上角的「导入科目」开始你的学习之旅
            </p>
            <Button
              className="mt-4 gap-2"
              onClick={() => setIsDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              导入科目
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
