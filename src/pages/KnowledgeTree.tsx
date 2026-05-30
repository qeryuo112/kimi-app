import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { LOGIN_PATH } from "@/const";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Network,
  ChevronRight,
  ChevronDown,
  Brain,
  Clock,
  Star,
  AlertTriangle,
} from "lucide-react";

interface TreeNodeData {
  id: number;
  title: string;
  description: string | null;
  level: number;
  mastery: number;
  importance: number;
  difficulty: number;
  estimatedMinutes: number | null;
  tags: string | null;
  children: TreeNodeData[];
}

interface TreeNodeProps {
  node: TreeNodeData;
  expandedNodes: Set<number>;
  toggleNode: (id: number) => void;
  onUpdateMastery: (id: number, mastery: number) => void;
}

function TreeNodeItem({ node, expandedNodes, toggleNode, onUpdateMastery }: TreeNodeProps) {
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = node.children.length > 0;
  const tags = node.tags ? JSON.parse(node.tags) : [];

  const masteryColor =
    node.mastery >= 80
      ? "bg-green-500"
      : node.mastery >= 50
      ? "bg-yellow-500"
      : node.mastery >= 20
      ? "bg-orange-500"
      : "bg-red-500";

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group ${
          node.level === 1 ? "bg-secondary/30" : ""
        }`}
        style={{ paddingLeft: `${node.level * 16 + 8}px` }}
        onClick={() => hasChildren && toggleNode(node.id)}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )
        ) : (
          <div className="w-4" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{node.title}</span>
            <div className="flex gap-1">
              {tags.slice(0, 2).map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0 h-4">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          {node.description && (
            <p className="text-xs text-muted-foreground truncate">{node.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{node.importance}</span>
          </div>
          <div className="w-20">
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="text-muted-foreground">掌握度</span>
              <span className={node.mastery >= 80 ? "text-green-400" : node.mastery >= 50 ? "text-yellow-400" : "text-red-400"}>
                {node.mastery}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full ${masteryColor} transition-all`}
                style={{ width: `${node.mastery}%` }}
              />
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              const newMastery = Math.min(100, node.mastery + 10);
              onUpdateMastery(node.id, newMastery);
            }}
          >
            +10%
          </Button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              onUpdateMastery={onUpdateMastery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function KnowledgeTree() {
  const { isAuthenticated } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: LOGIN_PATH,
  });

  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();
  const { data: subjects } = trpc.subject.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: treeData, isLoading } = trpc.knowledge.getTree.useQuery(
    { subjectId: Number(selectedSubject) },
    { enabled: isAuthenticated && !!selectedSubject }
  );

  const updateMastery = trpc.knowledge.updateMastery.useMutation({
    onSuccess: () => {
      utils.knowledge.getTree.invalidate();
      utils.subject.list.invalidate();
    },
  });

  const toggleNode = (id: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 构建树结构
  interface TreeNode {
    id: number;
    title: string;
    description: string | null;
    level: number;
    mastery: number;
    importance: number;
    difficulty: number;
    estimatedMinutes: number | null;
    tags: string | null;
    children: TreeNode[];
  }

  const buildTree = (): TreeNode[] => {
    if (!treeData?.nodes) return [];

    const nodeMap = new Map<number, TreeNode>();

    for (const n of treeData.nodes) {
      nodeMap.set(n.id, { ...n, children: [] });
    }

    const roots: TreeNode[] = [];

    for (const node of treeData.nodes) {
      const treeNode = nodeMap.get(node.id);
      if (!treeNode) continue;
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children.push(treeNode);
        }
      } else {
        roots.push(treeNode);
      }
    }

    return roots;
  };

  const tree = buildTree();
  const analyzedSubjects = subjects?.filter((s) => s.status === "analyzed") || [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold glow-text">知识树</h1>
          <p className="text-sm text-muted-foreground mt-1">
            可视化查看AI生成的知识结构，跟踪掌握进度
          </p>
        </div>
        <Select value={selectedSubject} onValueChange={setSelectedSubject}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="选择科目查看知识树" />
          </SelectTrigger>
          <SelectContent>
            {analyzedSubjects.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedSubject && treeData ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 知识树主体 */}
          <Card className="lg:col-span-3 glass glow-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                知识结构
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-280px)]">
                {isLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : tree.length > 0 ? (
                  <div className="space-y-1">
                    {tree.map((node) => (
                      <TreeNodeItem
                        key={node.id}
                        node={node}
                        expandedNodes={expandedNodes}
                        toggleNode={toggleNode}
                        onUpdateMastery={(id, mastery) =>
                          updateMastery.mutate({ id, mastery })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <AlertTriangle className="h-10 w-10 mb-3" />
                    <p>该科目暂无知识节点</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* 统计面板 */}
          <div className="space-y-4">
            <Card className="glass glow-card border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  掌握统计
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">总节点</span>
                  <span className="font-medium">{treeData.nodes.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">已掌握</span>
                  <span className="font-medium text-green-400">
                    {treeData.nodes.filter((n) => n.mastery >= 80).length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">学习中</span>
                  <span className="font-medium text-yellow-400">
                    {
                      treeData.nodes.filter(
                        (n) => n.mastery >= 20 && n.mastery < 80
                      ).length
                    }
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">未开始</span>
                  <span className="font-medium text-red-400">
                    {treeData.nodes.filter((n) => n.mastery < 20).length}
                  </span>
                </div>
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">总体掌握度</span>
                    <span className="font-bold text-primary">
                      {treeData.nodes.length > 0
                        ? Math.round(
                            treeData.nodes.reduce((s, n) => s + n.mastery, 0) /
                              treeData.nodes.length
                          )
                        : 0}
                      %
                    </span>
                  </div>
                  <Progress
                    value={
                      treeData.nodes.length > 0
                        ? treeData.nodes.reduce((s, n) => s + n.mastery, 0) /
                            treeData.nodes.length
                        : 0
                    }
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="glass glow-card border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  时间估算
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">预计总时长</span>
                  <span className="font-medium">
                    {Math.round(
                      treeData.nodes.reduce(
                        (s, n) => s + (n.estimatedMinutes || 30),
                        0
                      ) / 60
                    )}
                    h
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">已完成</span>
                  <span className="font-medium text-green-400">
                    {Math.round(
                      treeData.nodes.reduce(
                        (s, n) => s + (n.estimatedMinutes || 30) * (n.mastery / 100),
                        0
                      ) / 60
                    )}
                    h
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="glass border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <Network className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">选择一个科目</p>
            <p className="text-sm text-muted-foreground mt-1">
              从上方选择已分析的科目查看知识树
            </p>
            {analyzedSubjects.length === 0 && subjects && subjects.length > 0 && (
              <p className="text-sm text-yellow-400 mt-4">
                你还没有已分析的科目，先去「科目管理」页面进行AI分析
              </p>
            )}
            {subjects?.length === 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                还没有科目，先去「科目管理」页面导入内容
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
