import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Zap,
  Plus,
  Star,
  TrendingUp,
  Award,
  Brain,
  Target,
  Code2,
  Palette,
  Music,
  Languages,
  Calculator,
  FlaskConical,
  History,
  Globe,
  Lightbulb,
  Puzzle,
  Dumbbell,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Brain, Target, Code2, Palette, Music, Languages, Calculator,
  FlaskConical, History, Globe, Lightbulb, Puzzle, Dumbbell,
  Zap, Star, TrendingUp, Award, Sparkles,
};

function getIcon(iconName: string | null): LucideIcon {
  if (!iconName) return Zap;
  return iconMap[iconName] || Zap;
}

export default function Skills() {
  const { isAuthenticated } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  const utils = trpc.useUtils();
  const { data: skills, isLoading } = trpc.skill.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const addAssessment = trpc.skill.addAssessment.useMutation({
    onSuccess: () => {
      utils.skill.list.invalidate();
      toast.success("评估已更新");
      setIsAssessOpen(false);
    },
  });

  const addExperience = trpc.skill.addExperience.useMutation({
    onSuccess: (data) => {
      utils.skill.list.invalidate();
      toast.success(`获得经验！当前等级: ${data.newLevel}`);
    },
  });

  const createSkill = trpc.skill.create.useMutation({
    onSuccess: () => {
      utils.skill.list.invalidate();
      toast.success("技能已创建");
      setIsCreateOpen(false);
      resetForm();
    },
  });

  const [isAssessOpen, setIsAssessOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<number | null>(null);
  const [assessScore, setAssessScore] = useState(50);

  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    icon: "Zap",
    color: "#10b981",
    weight: 1,
  });

  const resetForm = () => {
    setForm({ name: "", description: "", category: "", icon: "Zap", color: "#10b981", weight: 1 });
  };

  const selectedSkillData = skills?.find((s) => s.id === selectedSkill);

  // 按分类分组
  const groupedSkills = skills?.reduce((acc, skill) => {
    const cat = skill.category || "未分类";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {} as Record<string, typeof skills>);

  const totalSkills = skills?.length || 0;
  const avgLevel = skills && skills.length > 0
    ? Math.round(skills.reduce((s, k) => s + k.currentLevel, 0) / skills.length)
    : 0;
  const maxLevel = skills && skills.length > 0
    ? Math.max(...skills.map((s) => s.currentLevel))
    : 0;
  const totalExp = skills?.reduce((s, k) => s + k.experience, 0) || 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold glow-text">技能面板</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RPG风格的能力系统，追踪你的各项技能成长
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              添加技能
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建新技能</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">技能名称</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：逻辑思维" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">描述</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="描述这个技能..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">分类</label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="例如：认知能力" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">图标</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(iconMap).slice(0, 12).map(([name, Icon]) => (
                    <button
                      key={name}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        form.icon === name ? "bg-primary/30 border border-primary" : "bg-secondary hover:bg-secondary/80"
                      }`}
                      onClick={() => setForm({ ...form, icon: name })}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">颜色</label>
                <div className="flex gap-2">
                  {["#10b981", "#3b82f6", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"].map((c) => (
                    <button
                      key={c}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        form.color === c ? "border-white scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setForm({ ...form, color: c })}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
              <Button onClick={() => createSkill.mutate(form)} disabled={createSkill.isPending}>
                {createSkill.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass glow-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">技能总数</p>
              <p className="text-xl font-bold">{totalSkills}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass glow-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <Star className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">平均等级</p>
              <p className="text-xl font-bold">{avgLevel}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass glow-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Award className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">最高等级</p>
              <p className="text-xl font-bold">{maxLevel}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass glow-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">总经验值</p>
              <p className="text-xl font-bold">{totalExp}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 技能列表 */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-32 animate-pulse bg-secondary/50" />
          ))}
        </div>
      ) : groupedSkills && Object.keys(groupedSkills).length > 0 ? (
        <ScrollArea className="h-[calc(100vh-340px)]">
          <div className="space-y-6 pr-4">
            {Object.entries(groupedSkills).map(([category, categorySkills]) => (
              <div key={category}>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {category}
                  </Badge>
                  <span>{categorySkills.length} 个技能</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {categorySkills.map((skill) => {
                    const Icon = getIcon(skill.icon);
                    const skillColor = skill.color || "#10b981";
                    const expPercent = skill.experienceToNext
                      ? (skill.experience / skill.experienceToNext) * 100
                      : 0;

                    return (
                      <Card
                        key={skill.id}
                        className="glass glow-card border-border/50 hover:border-primary/30 transition-all group cursor-pointer"
                        onClick={() => {
                          setSelectedSkill(skill.id);
                          setIsAssessOpen(true);
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div
                              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${skillColor}20` }}
                            >
                              <Icon className="h-5 w-5" style={{ color: skillColor }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-sm">{skill.name}</h3>
                                <Badge
                                  className="text-[10px]"
                                  style={{
                                    backgroundColor: `${skillColor}30`,
                                    color: skillColor,
                                    borderColor: `${skillColor}50`,
                                  }}
                                  variant="outline"
                                >
                                  Lv.{skill.currentLevel}
                                </Badge>
                              </div>
                              {skill.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {skill.description}
                                </p>
                              )}
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-[10px] mb-1">
                                  <span className="text-muted-foreground">
                                    EXP {skill.experience} / {skill.experienceToNext}
                                  </span>
                                  <span style={{ color: skillColor }}>
                                    {Math.round(expPercent)}%
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${expPercent}%`,
                                      backgroundColor: skillColor,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                addExperience.mutate({ skillId: skill.id, exp: 10 });
                              }}
                            >
                              +10 EXP
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                addExperience.mutate({ skillId: skill.id, exp: 50 });
                              }}
                            >
                              +50 EXP
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Zap className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">还没有技能维度</p>
            <p className="text-sm text-muted-foreground mt-1">
              导入科目并进行AI分析，或手动添加技能
            </p>
          </CardContent>
        </Card>
      )}

      {/* 评估对话框 */}
      <Dialog open={isAssessOpen} onOpenChange={setIsAssessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedSkillData && (
                <>
                  {(() => {
                    const Icon = getIcon(selectedSkillData.icon);
                    const c = selectedSkillData.color || "#10b981";
                    return (
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${c}20` }}
                      >
                        <Icon className="h-4 w-4" style={{ color: c }} />
                      </div>
                    );
                  })()}
                  评估：{selectedSkillData.name}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">当前评分：{assessScore}</label>
              <Input
                type="range"
                min={0}
                max={100}
                value={assessScore}
                onChange={(e) => setAssessScore(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>新手 (0)</span>
                <span>入门 (25)</span>
                <span>熟练 (50)</span>
                <span>精通 (75)</span>
                <span>大师 (100)</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssessOpen(false)}>取消</Button>
            <Button
              onClick={() => {
                if (selectedSkill) {
                  addAssessment.mutate({
                    skillId: selectedSkill,
                    score: assessScore,
                    assessedBy: "self",
                  });
                }
              }}
              disabled={addAssessment.isPending}
            >
              {addAssessment.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              提交评估
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
