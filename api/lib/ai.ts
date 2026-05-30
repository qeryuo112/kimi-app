// AI服务模块 - 调用Kimi API进行内容分析
import { env } from "./env";

interface KimiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface KimiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// 调用Kimi API进行对话
export async function chatWithAI(
  messages: KimiMessage[],
  temperature = 0.7
): Promise<string> {
  const apiKey = env.appSecret; // 使用App Secret作为API Key
  const apiUrl = `${env.kimiOpenUrl}/v1/chat/completions`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "kimi-latest",
      messages,
      temperature,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API调用失败: ${error}`);
  }

  const data = (await response.json()) as KimiResponse;
  return data.choices[0]?.message?.content || "";
}

// 分析书籍/科目内容，生成知识树
export async function analyzeContentForKnowledgeTree(
  content: string,
  title: string
): Promise<{
  nodes: Array<{
    title: string;
    description: string;
    level: number;
    orderIndex: number;
    importance: number;
    difficulty: number;
    estimatedMinutes: number;
    tags: string[];
    parentTitle?: string;
  }>;
  edges: Array<{
    sourceTitle: string;
    targetTitle: string;
    relationType: string;
    strength: number;
  }>;
}> {
  const systemPrompt = `你是一个专业的教育内容分析AI。请分析用户提供的书籍或科目内容，提取知识结构并生成知识树。

要求：
1. 识别主要章节和关键知识点
2. 建立知识点之间的层次关系（父子关系）
3. 识别知识点之间的关联（前置知识、相关、扩展、组成）
4. 为每个知识点评估重要性(1-5)和难度(1-5)
5. 估算每个知识点的学习时间(分钟)

请严格按照JSON格式返回，不要包含任何其他文本。格式如下：
{
  "nodes": [
    {
      "title": "知识节点标题",
      "description": "详细描述",
      "level": 1,
      "orderIndex": 0,
      "importance": 4,
      "difficulty": 3,
      "estimatedMinutes": 45,
      "tags": ["tag1", "tag2"],
      "parentTitle": "父节点标题（根节点省略）"
    }
  ],
  "edges": [
    {
      "sourceTitle": "源节点标题",
      "targetTitle": "目标节点标题",
      "relationType": "prerequisite|related|extends|partOf",
      "strength": 3
    }
  ]
}`;

  const userPrompt = `请分析以下内容并生成知识树：

标题：${title}

内容：
${content.slice(0, 8000)}
`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.5
  );

  try {
    const parsed = JSON.parse(result);
    return {
      nodes: parsed.nodes || [],
      edges: parsed.edges || [],
    };
  } catch {
    throw new Error("AI返回的数据格式不正确");
  }
}

// 分析内容生成技能维度
export async function analyzeContentForSkills(
  content: string,
  title: string
): Promise<{
  skills: Array<{
    name: string;
    description: string;
    category: string;
    icon: string;
    color: string;
    weight: number;
    parentName?: string;
  }>;
}> {
  const systemPrompt = `你是一个专业技能分析AI。请分析用户提供的学习内容，提取需要掌握的技能维度。

要求：
1. 识别核心技能和子技能
2. 建立技能的层次结构（支持技能树）
3. 为每个技能分配权重(0.1-5.0，表示重要性)
4. 为每个技能选择合适的图标(lucide-react图标名称)和颜色(hex格式)
5. 将技能分类（认知技能、实践技能、思维技能、工具技能等）

请严格按照JSON格式返回。格式如下：
{
  "skills": [
    {
      "name": "技能名称",
      "description": "技能描述",
      "category": "技能分类",
      "icon": "Brain",
      "color": "#3b82f6",
      "weight": 2.5,
      "parentName": "父技能名称（顶级技能省略）"
    }
  ]
}`;

  const userPrompt = `请分析以下内容并提取技能维度：

标题：${title}

内容：
${content.slice(0, 8000)}
`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.5
  );

  try {
    const parsed = JSON.parse(result);
    return {
      skills: parsed.skills || [],
    };
  } catch {
    throw new Error("AI返回的技能数据格式不正确");
  }
}

// 生成学习计划
export async function generateStudyPlan(
  subjectTitle: string,
  knowledgeNodes: Array<{ title: string; level: number; estimatedMinutes: number; difficulty: number }>,
  dailyMinutes: number,
  userLevel: string
): Promise<{
  plan: Array<{
    day: number;
    title: string;
    nodes: string[];
    estimatedMinutes: number;
    focus: string;
  }>;
}> {
  const systemPrompt = `你是一个专业的学习规划AI。请根据知识树和用户情况生成学习计划。

要求：
1. 按天安排学习内容
2. 考虑知识点的依赖关系（前置知识优先）
3. 合理分配每天的学习时间
4. 提供每天的学习重点

请严格按照JSON格式返回。格式如下：
{
  "plan": [
    {
      "day": 1,
      "title": "第1天 - 主题",
      "nodes": ["知识点1", "知识点2"],
      "estimatedMinutes": 120,
      "focus": "学习重点说明"
    }
  ]
}`;

  const nodesInfo = knowledgeNodes
    .map((n) => `- ${n.title} (层级${n.level}, ${n.estimatedMinutes}分钟, 难度${n.difficulty})`)
    .join("\n");

  const userPrompt = `请为以下内容生成学习计划：

科目：${subjectTitle}
用户水平：${userLevel}
每天可用时间：${dailyMinutes}分钟

知识节点：
${nodesInfo}
`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.6
  );

  try {
    const parsed = JSON.parse(result);
    return {
      plan: parsed.plan || [],
    };
  } catch {
    throw new Error("AI返回的计划数据格式不正确");
  }
}

// AI助手对话（支持上下文）
export async function aiAssistantChat(
  messages: Array<{ role: string; content: string }>,
  contextData?: Record<string, unknown>
): Promise<string> {
  const systemPrompt = `你是「学霸黑科技系统」的AI助手，一个专业的学习规划和个人能力评估顾问。

你的能力：
1. 分析学习内容和进度
2. 提供学习建议和方法
3. 评估能力水平
4. 帮助制定学习计划
5. 回答学习相关的问题
6. 可以调用系统功能修改数据（如更新学习记录、调整技能等级等）

当用户要求修改数据时，请返回JSON格式的操作指令，包含action字段：
- update_skill: 更新技能等级
- add_study_log: 添加学习记录
- update_mastery: 更新知识点掌握度
- create_subject: 创建新科目

你当前可以访问的系统数据：
${contextData ? JSON.stringify(contextData, null, 2) : "暂无上下文数据"}

请以专业、鼓励性的语气回复。如果是数据操作请求，请在回复末尾附上JSON指令。`;

  const chatMessages: KimiMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const result = await chatWithAI(chatMessages, 0.7);
  return result;
}
