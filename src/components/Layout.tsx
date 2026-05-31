import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  LayoutDashboard,
  BookOpen,
  Network,
  Zap,
  BrainCircuit,
  MessageSquareCode,
  Settings,
  User,
  Sparkles,
  Target,
  FileQuestion,
  CheckSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { path: "/", label: "仪表盘", icon: LayoutDashboard },
  { path: "/todos", label: "今日任务", icon: CheckSquare },
  { path: "/plans", label: "学习计划", icon: Target },
  { path: "/subjects", label: "科目管理", icon: BookOpen },
  { path: "/knowledge", label: "知识树", icon: Network },
  { path: "/skills", label: "技能面板", icon: Zap },
  { path: "/questions", label: "题库", icon: FileQuestion },
  { path: "/study", label: "学习记录", icon: BrainCircuit },
  { path: "/ai-assistant", label: "AI 助手", icon: MessageSquareCode },
  { path: "/settings", label: "设置", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      {/* 侧边栏 */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar-background flex flex-col">
        {/* Logo */}
        <div className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center animate-pulse-glow">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-sidebar-foreground leading-tight">
              学霸黑科技
            </h1>
            <p className="text-[10px] text-muted-foreground">学习评估系统</p>
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* 导航 */}
        <ScrollArea className="flex-1 py-2">
          <nav className="px-2 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-primary/15 text-primary glow-border"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 ${isActive ? "text-primary" : ""}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        <Separator className="bg-sidebar-border" />

        {/* 用户信息 */}
        <div className="p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-accent/50">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name || ""}
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {user?.name || "用户"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user?.email || ""}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto grid-bg">
          {children}
        </div>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
