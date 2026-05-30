import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Zap,
  Clock,
  TrendingUp,
  Target,
  Flame,
  BrainCircuit,
  ArrowUpRight,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Link } from "react-router";

export default function Home() {
  const { isAuthenticated, isLoading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  const { data: subjects, isLoading: subjectsLoading } = trpc.subject.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: skills, isLoading: skillsLoading } = trpc.skill.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: studyData, isLoading: studyLoading } = trpc.study.getStats.useQuery(
    { days: 14 },
    { enabled: isAuthenticated }
  );

  const { data: recentLogs } = trpc.study.list.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );

  if (authLoading || !isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isLoading = subjectsLoading || skillsLoading || studyLoading;

  // 统计数据
  const totalSubjects = subjects?.length || 0;
  const analyzedSubjects = subjects?.filter((s) => s.status === "analyzed").length || 0;
  const totalNodes = subjects?.reduce((sum, s) => sum + (s.progress || 0), 0) || 0;
  const totalSkills = skills?.length || 0;
  const totalStudyMinutes = studyData?.summary?.totalMinutes || 0;
  const avgDailyMinutes = studyData?.summary?.avgDailyMinutes || 0;
  const studyStreak = 5; // 简化计算

  // 雷达图数据
  const radarData = skills
    ? skills.slice(0, 8).map((skill) => ({
        name: skill.name.slice(0, 6),
        value: skill.currentLevel,
        fullMark: 100,
      }))
    : [];

  // 学习趋势数据
  const trendData = studyData?.stats?.map((s) => ({
    date: s.statDate.slice(5),
    minutes: s.totalMinutes,
  })) || [];

  // 科目进度数据
  const subjectProgress = subjects?.map((s) => ({
    name: s.title.slice(0, 12),
    progress: s.progress || 0,
    color: s.color || "#3b82f6",
  })) || [];

  return (
    <div className="p-6 space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold glow-text">系统总览</h1>
          <p className="text-sm text-muted-foreground mt-1">
            实时监控你的学习状态和能力成长
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-primary border-primary/30">
            <Flame className="h-3 w-3" />
            连续学习 {studyStreak} 天
          </Badge>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="学习科目"
          value={totalSubjects}
          sub={`${analyzedSubjects} 个已分析`}
          icon={BookOpen}
          color="text-blue-400"
          loading={isLoading}
          link="/subjects"
        />
        <MetricCard
          title="技能维度"
          value={totalSkills}
          sub={`平均等级 ${skills && skills.length > 0 ? Math.round(skills.reduce((s, k) => s + k.currentLevel, 0) / skills.length) : 0}`}
          icon={Zap}
          color="text-yellow-400"
          loading={isLoading}
          link="/skills"
        />
        <MetricCard
          title="总学习时长"
          value={`${Math.round(totalStudyMinutes / 60)}h`}
          sub={`日均 ${avgDailyMinutes} 分钟`}
          icon={Clock}
          color="text-green-400"
          loading={isLoading}
          link="/study"
        />
        <MetricCard
          title="综合进度"
          value={`${totalSubjects > 0 ? Math.round(totalNodes / totalSubjects) : 0}%`}
          sub={`${totalNodes} 知识点`}
          icon={TrendingUp}
          color="text-purple-400"
          loading={isLoading}
          link="/knowledge"
        />
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 技能雷达图 */}
        <Card className="glass glow-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              能力雷达
            </CardTitle>
          </CardHeader>
          <CardContent>
            {skillsLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="name"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  />
                  <Radar
                    name="当前等级"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                暂无技能数据，请先导入科目并进行AI分析
              </div>
            )}
          </CardContent>
        </Card>

        {/* 学习趋势 */}
        <Card className="glass glow-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              学习趋势 (14天)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {studyLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    label={{
                      value: "分钟",
                      angle: -90,
                      position: "insideLeft",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="minutes"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 3 }}
                    activeDot={{ r: 5, fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                暂无学习记录，开始你的第一次学习吧
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 下部区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 科目进度 */}
        <Card className="glass glow-card border-border/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              科目进度
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {subjectsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))
            ) : subjectProgress.length > 0 ? (
              subjectProgress.map((s) => (
                <div key={s.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="text-xs font-medium" style={{ color: s.color }}>
                      {s.progress}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${s.progress}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                还没有科目，去
                <Link to="/subjects" className="text-primary hover:underline mx-1">
                  导入科目
                </Link>
                开始学习之旅
              </div>
            )}
          </CardContent>
        </Card>

        {/* 最近学习 */}
        <Card className="glass glow-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-primary" />
              最近学习
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentLogs?.length ? (
              recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{log.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.duration} 分钟 · {" "}
                      {new Date(log.date).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">
                    {"★".repeat(log.quality)}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                暂无学习记录
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
  color,
  loading,
  link,
}: {
  title: string;
  value: string | number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  loading: boolean;
  link: string;
}) {
  return (
    <Link to={link}>
      <Card className="glass glow-card border-border/50 hover:border-primary/30 transition-all duration-300 cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{title}</p>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{value}</p>
              )}
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
            <div
              className={`w-10 h-10 rounded-lg bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform`}
            >
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
          </div>
          <div className="mt-3 flex items-center text-[10px] text-primary">
            <span>查看详情</span>
            <ArrowUpRight className="h-3 w-3 ml-0.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
