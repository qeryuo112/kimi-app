// AI服务模块 - 调用Kimi API进行内容分析
import { env } from "./env";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageUrlContent {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "low" | "high" | "auto";
  };
}

export interface FileUrlContent {
  type: "file_url";
  file_url: {
    url: string;
  };
}

export interface VideoUrlContent {
  type: "video_url";
  video_url: {
    url: string;
  };
}

export type KimiContent = TextContent | ImageUrlContent | FileUrlContent | VideoUrlContent;

export interface KimiMessage {
  role: "system" | "user" | "assistant";
  content: string | KimiContent[];
}

interface KimiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// 调用AI API进行对话
export async function chatWithAI(
  messages: KimiMessage[],
  temperature = 0.7,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string,
  requireJson = false
): Promise<string> {
  const key = apiKey || env.appSecret;
  let url = apiUrl || `${env.kimiOpenUrl}/v1/chat/completions`;

  // 用户填写的是 base URL，补全路径
  if (url && !url.includes("/chat/completions")) {
    url = url.replace(/\/$/, "") + "/v1/chat/completions";
  }

  const body: Record<string, unknown> = {
    model: modelName || "kimi-latest",
    messages,
    temperature,
  };
  if (requireJson) {
    body.response_format = { type: "json_object" };
  }

  // 计算请求体大致大小用于调试
  const bodyStr = JSON.stringify(body);
  const bodySizeMB = (bodyStr.length / 1024 / 1024).toFixed(2);
  console.log(`[chatWithAI] request to ${url}, model=${modelName || "kimi-latest"}, bodySize=${bodySizeMB}MB, messages=${messages.length}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 300秒超时

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: bodyStr,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.text();
    console.error(`[chatWithAI] API error ${response.status}: ${error}`);
    throw new Error(`AI API调用失败 (${response.status}): ${error}`);
  }

  const data = (await response.json()) as KimiResponse;
  const content = data.choices[0]?.message.content || "";
  console.log(`[chatWithAI] success, response length=${content.length}`);
  return content;
}

// 分析书籍/科目内容，生成知识树 —— AI自动判定难度/优先级
export async function analyzeContentForKnowledgeTree(
  content: string,
  title: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
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
  subjectDifficulty: number; // 科目整体难度 1-5
  subjectPriority: number; // 科目优先级 1-5
}> {
  const systemPrompt = `你是一个专业的教育内容分析AI。请分析用户提供的科目，提取知识结构并生成知识树。

要求：
1. 识别主要章节和关键知识点（如果用户内容不够详细，请基于你对该学科的了解补充完整知识树）
2. 建立知识点之间的层次关系（父子关系）
3. 识别知识点之间的关联（前置知识、相关、扩展、组成）
4. 为每个知识点评估重要性(1-5)和难度(1-5)
5. 估算每个知识点的学习时间(分钟)
6. **分析完成后，评估该科目整体难度(1-5)和优先级(1-5)**
   - 难度：根据内容深度、抽象程度、前置知识要求
   - 优先级：根据该科目在学科体系中的基础性和重要性
7. 确保生成至少8-15个知识节点，覆盖该科目的核心内容

请严格按照JSON格式返回，不要包含任何其他文本。格式如下：
{
  "subjectDifficulty": 3,
  "subjectPriority": 4,
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

  const userPrompt = `请为以下科目生成完整的知识树：

标题：${title}

${content.trim().length > title.length + 5 ? `内容：\n${content.slice(0, 8000)}` : "用户仅提供了科目标题，请基于你对该学科的专业知识，生成一份完整、详细的知识树结构。"}
`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.5,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return {
      nodes: parsed.nodes || [],
      edges: parsed.edges || [],
      subjectDifficulty: parsed.subjectDifficulty || 3,
      subjectPriority: parsed.subjectPriority || 2,
    };
  } catch {
    throw new Error("AI返回的数据格式不正确");
  }
}

// 从文件URL分析科目内容并生成知识树
export async function analyzeFilesForKnowledgeTree(
  urls: string[],
  title: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
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
  subjectDifficulty: number;
  subjectPriority: number;
}> {
  const systemPrompt = `你是一个专业的教育内容分析AI。请仔细阅读用户提供的文件（教材、课件、参考资料等），提取知识结构并生成知识树。

要求：
1. 从文件中识别主要章节和关键知识点
2. 建立知识点之间的层次关系（父子关系）
3. 识别知识点之间的关联（前置知识、相关、扩展、组成）
4. 为每个知识点评估重要性(1-5)和难度(1-5)
5. 估算每个知识点的学习时间(分钟)
6. **分析完成后，评估该科目整体难度(1-5)和优先级(1-5)**
   - 难度：根据内容深度、抽象程度、前置知识要求
   - 优先级：根据该科目在学科体系中的基础性和重要性
7. 确保生成至少8-15个知识节点，覆盖该科目的核心内容

请严格按照JSON格式返回，不要包含任何其他文本。格式如下：
{
  "subjectDifficulty": 3,
  "subjectPriority": 4,
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

  // 构建多模态内容块
  const contentBlocks: KimiContent[] = urls.map((url) => {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
    if (imageExts.includes(ext)) {
      return { type: "image_url", image_url: { url } };
    }
    return { type: "file_url", file_url: { url } };
  });

  const userPrompt = `请从以上文件中提取知识树结构，科目名称：${title}`;

  const messages: KimiMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [...contentBlocks, { type: "text", text: userPrompt }],
    },
  ];

  const result = await chatWithAI(messages, 0.5, apiKey, apiUrl, modelName, true);

  try {
    const parsed = JSON.parse(result);
    return {
      nodes: parsed.nodes || [],
      edges: parsed.edges || [],
      subjectDifficulty: parsed.subjectDifficulty || 3,
      subjectPriority: parsed.subjectPriority || 2,
    };
  } catch {
    throw new Error("AI返回的数据格式不正确");
  }
}

// 分析内容生成技能维度
export async function analyzeContentForSkills(
  content: string,
  title: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
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
    0.5,
    apiKey,
    apiUrl,
    modelName,
    true
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

// 从文件URL分析技能维度
export async function analyzeFilesForSkills(
  urls: string[],
  title: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
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
  const systemPrompt = `你是一个专业技能分析AI。请仔细阅读用户提供的文件（教材、课件、参考资料等），提取需要掌握的技能维度。

要求：
1. 从文件中识别核心技能和子技能
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

  // 构建多模态内容块
  const contentBlocks: KimiContent[] = urls.map((url) => {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
    if (imageExts.includes(ext)) {
      return { type: "image_url", image_url: { url } };
    }
    return { type: "file_url", file_url: { url } };
  });

  const userPrompt = `请从以上文件中提取技能维度，科目名称：${title}`;

  const messages: KimiMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [...contentBlocks, { type: "text", text: userPrompt }],
    },
  ];

  const result = await chatWithAI(messages, 0.5, apiKey, apiUrl, modelName, true);

  try {
    const parsed = JSON.parse(result);
    return {
      skills: parsed.skills || [],
    };
  } catch {
    throw new Error("AI返回的技能数据格式不正确");
  }
}

// 联网搜索科目信息，自动分析并生成计划
export async function searchAndAnalyzeSubjects(
  goal: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  subjects: Array<{
    title: string;
    description: string;
    category: string;
    difficulty: number;
    priority: number;
    estimatedDays: number;
  }>;
}> {
  const systemPrompt = `你是一个专业的学习规划AI。请根据用户的学习目标，联网搜索并推荐需要学习的科目/知识领域。

请返回JSON格式：
{
  "subjects": [
    {
      "title": "科目名称",
      "description": "科目描述和学习内容概述",
      "category": "分类",
      "difficulty": 3,
      "priority": 4,
      "estimatedDays": 30
    }
  ]
}`;

  const userPrompt = `我的学习目标是：${goal}

请帮我搜索并推荐相关的学习科目。要求：
1. 列出该目标下需要掌握的核心科目
2. 为每个科目评估难度(1-5)和优先级(1-5)
3. 估算每个科目需要的学习天数
4. 科目描述中应包含主要学习内容`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.6,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return { subjects: parsed.subjects || [] };
  } catch {
    throw new Error("AI返回的科目数据格式不正确");
  }
}

// 第一层：生成轮次计划 + 月计划（粗略到月）
export async function generateRoundAndMonthlyPlan(
  subjects: Array<{ title: string; priority: number; difficulty: number; knowledgeNodes: string[] }>,
  dailyMinutes: number,
  startDate: string,
  totalMonths: number,
  reviewRounds: number,
  requirements?: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  rounds: Array<{
    round: number;
    name: string;
    focus: string;
    strategy: string;
    months: number[];
  }>;
  months: Array<{
    month: number;
    monthName: string;
    round: number;
    focus: string;
    subjects: string[];
    goals: string[];
  }>;
}> {
  const systemPrompt = `你是一个顶级的学习规划AI。请根据科目列表、总时长和复习轮数，设计科学的复习轮次计划和月计划。

要求：
1. 将${totalMonths}个月划分为${reviewRounds}个复习轮次，每轮有明确的策略（如：基础夯实/强化提升/冲刺模拟）
2. 第一轮最详细（新知识学习），后续轮次侧重复习和巩固
3. 每月计划列出重点科目和目标
4. 确保所有科目的知识点在${reviewRounds}轮中被完整覆盖
5. 高优先级/基础科目优先安排在第一轮前期

请返回JSON格式：
{
  "rounds": [
    {
      "round": 1,
      "name": "第一轮：基础夯实",
      "focus": "全面学习新知识，建立知识框架",
      "strategy": "逐章学习，配合课后练习",
      "months": [1, 2]
    }
  ],
  "months": [
    {
      "month": 1,
      "monthName": "第1个月",
      "round": 1,
      "focus": "本月学习重点",
      "subjects": ["科目1", "科目2"],
      "goals": ["完成XX章节", "掌握XX知识点"]
    }
  ]
}`;

  const nodesInfo = subjects
    .map(s => `- ${s.title} (优先级${s.priority}, 难度${s.difficulty})\n  知识点：${s.knowledgeNodes.join("、")}`)
    .join("\n");

  const userPrompt = `请为以下科目设计${reviewRounds}轮复习、共${totalMonths}个月的计划：

科目及知识点：
${nodesInfo}

每日可用时间：${dailyMinutes}分钟
开始日期：${startDate}
总时长：${totalMonths}个月
复习轮数：${reviewRounds}轮
${requirements ? `\n用户的特殊需求：${requirements}` : ""}`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.6,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return {
      rounds: parsed.rounds || [],
      months: parsed.months || [],
    };
  } catch {
    throw new Error("AI返回的轮次/月计划数据格式不正确");
  }
}

// 第二层：生成周计划（基于月计划细化到周）
export async function generateWeeklyPlan(
  subjects: Array<{ title: string; priority: number; difficulty: number; knowledgeNodes: Array<{ title: string; estimatedMinutes: number; difficulty: number; importance: number }> }>,
  dailyMinutes: number,
  totalWeeks: number,
  monthlyPlanContext: string,
  requirements?: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  weeks: Array<{
    week: number;
    month: number;
    focus: string;
    subjects: string[];
    knowledgeNodes: string[];
    goals: string[];
  }>;
}> {
  const systemPrompt = `你是一个科学的学习计划生成AI。请根据月计划和知识树，生成每周的学习计划。

要求：
1. 将学习内容细化到周级别
2. 每周有明确的主题和知识点安排
3. 考虑知识点的依赖关系（前置知识优先）
4. 每周只聚焦1-2个科目，避免跳跃
5. 每周安排适量的复习时间

请返回JSON格式：
{
  "weeks": [
    {
      "week": 1,
      "month": 1,
      "focus": "本周学习重点",
      "subjects": ["科目1"],
      "knowledgeNodes": ["知识点1", "知识点2"],
      "goals": ["完成XX", "掌握XX"]
    }
  ]
}`;

  const subjectsInfo = subjects.map(s => {
    const nodes = s.knowledgeNodes
      .map(n => `  - ${n.title} (预计${n.estimatedMinutes}分钟, 难度${n.difficulty})`)
      .join("\n");
    return `- ${s.title}:\n${nodes}`;
  }).join("\n\n");

  const userPrompt = `请生成${totalWeeks}周的详细周计划：

科目及知识点：
${subjectsInfo}

每日可用时间：${dailyMinutes}分钟

月计划概览：
${monthlyPlanContext}
${requirements ? `\n用户的特殊需求：${requirements}` : ""}`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.6,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return { weeks: parsed.weeks || [] };
  } catch {
    throw new Error("AI返回的周计划数据格式不正确");
  }
}

// 第三层：生成日计划（基于周计划细化到每天）
export async function generateDailyPlan(
  subjects: Array<{ title: string; priority: number; difficulty: number; knowledgeNodes: Array<{ title: string; estimatedMinutes: number; difficulty: number; importance: number }> }>,
  dailyMinutes: number,
  startDate: string,
  daysCount: number,
  weeklyContext: string,
  requirements?: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  days: Array<{
    day: number;
    date: string;
    week: number;
    month: number;
    subject: string;
    knowledgeNodes: string[];
    estimatedMinutes: number;
    focus: string;
    review: boolean;
  }>;
}> {
  const systemPrompt = `你是一个科学的学习计划生成AI。请根据周计划和知识树节点，生成每天的具体学习计划。

【核心规则 - 必须严格遵守】
1. 每天的学习内容细化到具体知识点
2. 考虑知识点的依赖关系（前置知识优先）
3. 高难度知识点分配更多时间
4. **每天必须安排所有科目，每个科目作为独立的条目返回。同一天内的多个科目条目必须使用完全相同的day和date值。每个科目分配适量知识点，确保所有科目每天都有进展**
5. **每7天安排一次回顾日（review=true）。回顾日只复习该周（最近7天内）已经学习过的知识点，不要包含尚未学习或更早周次的知识点。对于每个科目，回顾日创建一个独立条目，review=true，knowledgeNodes只包含该科目当周已学的知识点**
6. 确保day序号从1开始连续，date从startDate开始按天递增
7. 每个条目包含week和month字段，标识属于第几周和第几个月
8. **必须覆盖所有科目的所有知识点，不能遗漏任何科目**
9. 每个科目的知识点应均匀分布在整个计划中
10. 根据dailyMinutes合理拆分时间给每个科目

【JSON格式要求】
- 同一天有多个科目时，返回多个条目，它们的day和date完全相同，只有subject和knowledgeNodes不同
- 回顾日 likewise：每个科目一个条目，review=true

请返回JSON格式：
{
  "days": [
    {
      "day": 1,
      "date": "2026-06-01",
      "week": 1,
      "month": 1,
      "subject": "科目A",
      "knowledgeNodes": ["知识点1", "知识点2"],
      "estimatedMinutes": 60,
      "focus": "今日学习重点",
      "review": false
    },
    {
      "day": 1,
      "date": "2026-06-01",
      "week": 1,
      "month": 1,
      "subject": "科目B",
      "knowledgeNodes": ["知识点3", "知识点4"],
      "estimatedMinutes": 60,
      "focus": "今日学习重点",
      "review": false
    }
  ]
}`;

  const subjectsInfo = subjects.map(s => {
    const nodes = s.knowledgeNodes
      .map(n => `  - ${n.title} (预计${n.estimatedMinutes}分钟, 难度${n.difficulty}, 重要性${n.importance})`)
      .join("\n");
    return `- ${s.title}:\n${nodes}`;
  }).join("\n\n");

  const userPrompt = `请生成${daysCount}天的详细日计划：

科目及知识点：
${subjectsInfo}

每日可用时间：${dailyMinutes}分钟
开始日期：${startDate}

周计划概览：
${weeklyContext}
${requirements ? `\n用户的特殊需求：${requirements}` : ""}`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.6,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return { days: parsed.days || [] };
  } catch {
    throw new Error("AI返回的日计划数据格式不正确");
  }
}

// AI出题（支持从文件URL读取内容后出题）
export async function generateQuestionsFromFileUrls(
  urls: string[],
  questionType: string,
  count: number,
  difficulty: number,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  questions: Array<{
    content: string;
    options?: Array<{ label: string; text: string }>;
    correctAnswer: string;
    explanation: string;
    difficulty: number;
    imageUrl?: string;
    detectedSubject?: string;
    detectedKnowledgePoint?: string;
  }>;
}> {
  const typeDesc = questionType === "mixed"
    ? "混合题型（自动混合单选、多选、填空、简答等）"
    : questionType === "single_choice" ? "单选题" : questionType === "multiple_choice" ? "多选题" : questionType === "fill_blank" ? "填空题" : questionType === "short_answer" ? "简答题" : "论述题";

  const systemPrompt = `你是一个专业的出题AI。请仔细阅读用户提供的文件内容，然后根据内容生成高质量的练习题。

题目类型：${questionType}
- single_choice: 单选题，必须有4个选项
- multiple_choice: 多选题，必须有4个选项，正确答案可能是多个
- fill_blank: 填空题
- short_answer: 简答题
- essay: 论述题
- mixed: 混合题型，自动组合以上多种题型

要求：
1. 仔细理解文件中的知识点内容
2. 题目必须紧扣文件内容，考察对知识点的理解
3. 选项要有干扰性，不能一眼看出答案
4. 提供详细的答案解析
5. 每道题标注难度(1-5)
6. mixed模式下，必须混合至少2种不同题型
7. **分析文件内容所属的学科，以及每道题目考察的具体知识点，并返回在detectedSubject和detectedKnowledgePoint字段中**

请返回JSON格式：
{
  "questions": [
    {
      "content": "题目内容",
      "options": [{"label": "A", "text": "选项A"}, {"label": "B", "text": "选项B"}, {"label": "C", "text": "选项C"}, {"label": "D", "text": "选项D"}],
      "correctAnswer": "A",
      "explanation": "解析",
      "difficulty": 3,
      "detectedSubject": "识别的学科名称，如'数学'、'物理'、'编程'等",
      "detectedKnowledgePoint": "识别的具体知识点，如'二次函数'、'牛顿定律'等"
    }
  ]
}`;

  // 构建多模态内容
  const contentBlocks: KimiContent[] = urls.map((url) => {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
    const videoExts = ["mp4", "mov", "avi", "mkv", "webm"];
    if (imageExts.includes(ext)) {
      return { type: "image_url", image_url: { url } };
    }
    if (videoExts.includes(ext)) {
      return { type: "video_url", video_url: { url } };
    }
    return { type: "file_url", file_url: { url } };
  });

  const userPrompt = `请根据文件内容生成 ${count} 道 ${typeDesc}，难度要求 ${difficulty}/5。`;

  const messages: KimiMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [...contentBlocks, { type: "text", text: userPrompt }],
    },
  ];

  const result = await chatWithAI(messages, 0.7, apiKey, apiUrl, modelName, true);

  try {
    const parsed = JSON.parse(result);
    return { questions: parsed.questions || [] };
  } catch {
    throw new Error("AI返回的题目数据格式不正确");
  }
}

// AI出题（基于文本内容）
export async function generateQuestions(
  topic: string,
  knowledgeContent: string,
  questionType: string,
  count: number,
  difficulty: number,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  questions: Array<{
    content: string;
    options?: Array<{ label: string; text: string }>;
    correctAnswer: string;
    explanation: string;
    difficulty: number;
    imageUrl?: string;
    detectedSubject?: string;
    detectedKnowledgePoint?: string;
  }>;
}> {
  const typeDesc = questionType === "mixed"
    ? "混合题型（自动混合单选、多选、填空、简答等）"
    : questionType === "single_choice" ? "单选题" : questionType === "multiple_choice" ? "多选题" : questionType === "fill_blank" ? "填空题" : questionType === "short_answer" ? "简答题" : "论述题";

  const systemPrompt = `你是一个专业的出题AI。请根据知识点内容生成高质量的练习题。

题目类型：${questionType}
- single_choice: 单选题，必须有4个选项
- multiple_choice: 多选题，必须有4个选项，正确答案可能是多个
- fill_blank: 填空题
- short_answer: 简答题
- essay: 论述题
- mixed: 混合题型，自动组合以上多种题型

要求：
1. 题目必须紧扣知识点内容
2. 选项要有干扰性，不能一眼看出答案
3. 提供详细的答案解析
4. 每道题标注难度(1-5)
5. 如果题目适合配合图片（如观察图形、图表、示意图等），可以添加imageUrl字段，值为图片描述文字（如"细胞结构示意图"、"二次函数图像"等）
6. mixed模式下，必须混合至少2种不同题型
7. **分析题目所属学科和具体考察的知识点，并返回在detectedSubject和detectedKnowledgePoint字段中**

请返回JSON格式：
{
  "questions": [
    {
      "content": "题目内容",
      "options": [{"label": "A", "text": "选项A"}, {"label": "B", "text": "选项B"}, {"label": "C", "text": "选项C"}, {"label": "D", "text": "选项D"}],
      "correctAnswer": "A",
      "explanation": "解析",
      "difficulty": 3,
      "imageUrl": "可选：图片描述文字",
      "detectedSubject": "识别的学科名称，如'数学'、'物理'、'编程'等",
      "detectedKnowledgePoint": "识别的具体知识点，如'二次函数'、'牛顿定律'、'React Hooks'等"
    }
  ]
}`;

  const userPrompt = `请根据以下内容生成 ${count} 道 ${typeDesc}：

知识点：${topic}

内容：
${knowledgeContent.slice(0, 6000)}

难度要求：${difficulty}/5`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.7,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return { questions: parsed.questions || [] };
  } catch {
    throw new Error("AI返回的题目数据格式不正确");
  }
}

// 评估用户答案
export async function evaluateAnswer(
  question: string,
  correctAnswer: string,
  userAnswer: string,
  questionType: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  isCorrect: boolean;
  score: number;
  feedback: string;
  mastery: number; // 掌握度 0-100
}> {
  const systemPrompt = `你是一个专业的学习评估AI。请评估用户的答案，给出得分和反馈。

请返回JSON格式：
{
  "isCorrect": true,
  "score": 85,
  "feedback": "详细反馈",
  "mastery": 75
}`;

  const userPrompt = `题目：${question}

正确答案：${correctAnswer}

用户答案：${userAnswer}

题目类型：${questionType}

请评估用户答案。`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.5,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return {
      isCorrect: parsed.isCorrect || false,
      score: parsed.score || 0,
      feedback: parsed.feedback || "",
      mastery: parsed.mastery || 0,
    };
  } catch {
    // 简单字符串匹配作为fallback
    const normalizedCorrect = correctAnswer.toLowerCase().trim();
    const normalizedUser = userAnswer.toLowerCase().trim();
    const isCorrect = normalizedUser === normalizedCorrect;
    return {
      isCorrect,
      score: isCorrect ? 100 : 0,
      feedback: isCorrect ? "回答正确！" : `回答错误。正确答案是：${correctAnswer}`,
      mastery: isCorrect ? 80 : 20,
    };
  }
}

// 评估学习记录质量
export async function evaluateStudyLogQuality(
  title: string,
  content: string,
  duration: number,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  quality: number; // 1-5
  feedback: string;
  suggestions: string[];
}> {
  const systemPrompt = `你是一个专业的学习质量评估AI。请评估用户的学习记录质量。

请返回JSON格式：
{
  "quality": 4,
  "feedback": "学习质量评价",
  "suggestions": ["建议1", "建议2"]
}`;

  const userPrompt = `请评估以下学习记录：

标题：${title}
学习时长：${duration}分钟

内容：
${content || "无详细内容"}

请评估：
1. 学习质量(1-5分)
2. 给出评价反馈
3. 提供改进建议`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.6,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return {
      quality: Math.max(1, Math.min(5, parsed.quality || 3)),
      feedback: parsed.feedback || "",
      suggestions: parsed.suggestions || [],
    };
  } catch {
    return {
      quality: 3,
      feedback: "无法评估学习质量",
      suggestions: ["请详细记录学习内容以便更好评估"],
    };
  }
}

// 根据学习记录生成测试题
export async function generateStudyLogTests(
  title: string,
  content: string,
  count: number,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  questions: Array<{
    content: string;
    options: Array<{ label: string; text: string }>;
    correctAnswer: string;
    explanation: string;
    difficulty: number;
    knowledgePoint: string;
  }>;
}> {
  const systemPrompt = `你是一个专业的学习测试生成AI。请根据用户的学习记录内容生成测试题，检验用户对所学知识的掌握程度。

要求：
1. 测试题必须覆盖学习记录中的主要知识点
2. 每道题必须能从学习记录中找到依据
3. 题目要有一定难度，不能过于简单
4. 提供详细解析
5. 每道题标注对应的知识点

请返回JSON格式：
{
  "questions": [
    {
      "content": "题目内容",
      "options": [{"label": "A", "text": "选项A"}, {"label": "B", "text": "选项B"}, {"label": "C", "text": "选项C"}, {"label": "D", "text": "选项D"}],
      "correctAnswer": "A",
      "explanation": "解析",
      "difficulty": 3,
      "knowledgePoint": "对应的知识点"
    }
  ]
}`;

  const userPrompt = `请根据以下学习记录生成 ${count} 道测试题：

学习标题：${title}

学习内容：
${content.slice(0, 8000)}

请确保测试题覆盖以上内容的主要知识点。`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.6,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return { questions: parsed.questions || [] };
  } catch {
    throw new Error("AI返回的测试题数据格式不正确");
  }
}

// 生成学习计划
export async function generateStudyPlan(
  subjectTitle: string,
  knowledgeNodes: Array<{ title: string; level: number; estimatedMinutes: number; difficulty: number }>,
  dailyMinutes: number,
  userLevel: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
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
    0.6,
    apiKey,
    apiUrl,
    modelName,
    true
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

// 为Todo任务生成测试题（AI作为考官）
export async function generateTodoTestQuestions(
  subject: string,
  knowledgeNodes: string[],
  questionType: string = "mixed",
  count: number = 5,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  questions: Array<{
    id: string;
    content: string;
    options?: Array<{ label: string; text: string }>;
    correctAnswer: string;
    explanation: string;
    knowledgePoint: string;
    questionType?: string;
  }>;
}> {
  const typeDesc = questionType === "mixed"
    ? "混合题型（自动混合单选、多选、填空、简答等）"
    : questionType === "single_choice" ? "单选题" : questionType === "multiple_choice" ? "多选题" : questionType === "fill_blank" ? "填空题" : questionType === "short_answer" ? "简答题" : "论述题";

  const systemPrompt = `你是一位严格的考官AI。请根据用户今日学习的知识点生成${count}道${typeDesc}测试题来检验学习效果。

出题原则：
1. 必须生成指定数量和题型的题目
2. 题目必须紧扣知识点内容
3. 选项要有干扰性，不能一眼看出答案
4. 每道题必须有详细解析
5. 每道题标注对应的知识点

题目类型说明：
- single_choice: 单选题，必须有4个选项
- multiple_choice: 多选题，必须有4个选项，正确答案可能是多个
- fill_blank: 填空题
- short_answer: 简答题
- essay: 论述题
- mixed: 混合题型，自动组合以上多种题型

请返回JSON格式：
{
  "questions": [
    {
      "id": "q1",
      "content": "题目内容",
      "options": [{"label": "A", "text": "选项A"}, {"label": "B", "text": "选项B"}, {"label": "C", "text": "选项C"}, {"label": "D", "text": "选项D"}],
      "correctAnswer": "A",
      "explanation": "详细解析",
      "knowledgePoint": "对应知识点",
      "questionType": "single_choice"
    }
  ]
}`;

  const userPrompt = `请为以下知识点生成${count}道${typeDesc}：

科目：${subject}
知识点：
${knowledgeNodes.map((n, i) => `${i + 1}. ${n}`).join("\n")}

要求：
- 题目必须能从知识点中直接找到依据
- 严格按照指定数量和题型生成
- 核心/难点知识点分配更多题目`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.6,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return { questions: parsed.questions || [] };
  } catch {
    throw new Error("AI返回的测试题格式不正确");
  }
}

// 评估Todo测试答案（AI作为考官评分）
export async function evaluateTodoTestAnswers(
  subject: string,
  knowledgeNodes: string[],
  questions: Array<{ id: string; content: string; correctAnswer: string; explanation: string; knowledgePoint: string }>,
  answers: Array<{ questionId: string; userAnswer: string }>,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  mastery: number;
  correctCount: number;
  totalCount: number;
  feedback: string;
  suggestions: string[];
  weakPoints: string[];
}> {
  const systemPrompt = `你是一位严格的考官AI。请根据学生的答题情况，客观评估其对知识点的掌握程度。

要求：
1. 对比标准答案和学生答案，逐题评判
2. 掌握度评分要客观严格，不能放水
3. 指出学生的薄弱知识点
4. 给出后续学习建议

请返回JSON格式：
{
  "mastery": 75,
  "correctCount": 3,
  "totalCount": 5,
  "feedback": "总体评价",
  "suggestions": ["建议1", "建议2"],
  "weakPoints": ["薄弱知识点1"]
}`;

  const qaPairs = questions.map((q) => {
    const ans = answers.find((a) => a.questionId === q.id);
    return `题目：${q.content}\n标准答案：${q.correctAnswer}\n学生答案：${ans?.userAnswer || "未作答"}\n解析：${q.explanation}\n知识点：${q.knowledgePoint}`;
  }).join("\n\n---\n\n");

  const userPrompt = `请评估以下答题情况：

科目：${subject}
知识点范围：${knowledgeNodes.join("、")}

答题详情：
${qaPairs}`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.4,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return {
      mastery: Math.max(0, Math.min(100, parsed.mastery || 0)),
      correctCount: parsed.correctCount || 0,
      totalCount: parsed.totalCount || questions.length,
      feedback: parsed.feedback || "评估完成",
      suggestions: parsed.suggestions || [],
      weakPoints: parsed.weakPoints || [],
    };
  } catch {
    // fallback：简单字符串匹配评分
    let correct = 0;
    for (const q of questions) {
      const ans = answers.find((a) => a.questionId === q.id);
      if (ans && ans.userAnswer.trim().toUpperCase() === q.correctAnswer.trim().toUpperCase()) {
        correct++;
      }
    }
    const total = questions.length;
    const mastery = total > 0 ? Math.round((correct / total) * 100) : 0;
    return {
      mastery,
      correctCount: correct,
      totalCount: total,
      feedback: `答对 ${correct}/${total} 题，掌握度 ${mastery}%`,
      suggestions: mastery < 70 ? ["建议重新复习相关知识点", "多做练习题巩固"] : ["继续保持，定期复习"],
      weakPoints: [],
    };
  }
}

// 从文件生成测试题（AI考官根据文件内容出题）
export async function generateTodoTestFromFiles(
  urls: string[],
  subject: string,
  knowledgeNodes: string[],
  questionType: string = "mixed",
  count: number = 5,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  questions: Array<{
    id: string;
    content: string;
    options?: Array<{ label: string; text: string }>;
    correctAnswer: string;
    explanation: string;
    knowledgePoint: string;
    questionType?: string;
  }>;
}> {
  const typeDesc = questionType === "mixed"
    ? "混合题型（自动混合单选、多选、填空、简答等）"
    : questionType === "single_choice" ? "单选题" : questionType === "multiple_choice" ? "多选题" : questionType === "fill_blank" ? "填空题" : questionType === "short_answer" ? "简答题" : "论述题";

  const systemPrompt = `你是一位严格的考官AI。请仔细阅读用户提供的文件内容，然后根据内容生成${count}道${typeDesc}测试题来检验学习效果。

出题原则：
1. 仔细阅读文件内容，理解其中的知识点
2. 必须生成指定数量和题型的题目
3. 每道题必须有详细解析
4. 每道题标注对应的知识点

题目类型说明：
- single_choice: 单选题，必须有4个选项
- multiple_choice: 多选题，必须有4个选项，正确答案可能是多个
- fill_blank: 填空题
- short_answer: 简答题
- essay: 论述题
- mixed: 混合题型，自动组合以上多种题型

请返回JSON格式：
{
  "questions": [
    {
      "id": "q1",
      "content": "题目内容",
      "options": [{"label": "A", "text": "选项A"}, {"label": "B", "text": "选项B"}, {"label": "C", "text": "选项C"}, {"label": "D", "text": "选项D"}],
      "correctAnswer": "A",
      "explanation": "详细解析",
      "knowledgePoint": "对应知识点",
      "questionType": "single_choice"
    }
  ]
}`;

  // 构建多模态内容
  const contentBlocks: KimiContent[] = urls.map((url) => {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
    const videoExts = ["mp4", "mov", "avi", "mkv", "webm"];
    if (imageExts.includes(ext)) {
      return { type: "image_url", image_url: { url } };
    }
    if (videoExts.includes(ext)) {
      return { type: "video_url", video_url: { url } };
    }
    return { type: "file_url", file_url: { url } };
  });

  const userPrompt = `请根据文件内容生成${count}道${typeDesc}。

科目：${subject}
知识点范围：${knowledgeNodes.join("、")}

要求：
- 题目必须基于文件内容
- 严格按照指定数量和题型生成
- 核心/难点知识点分配更多题目`;

  const messages: KimiMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [...contentBlocks, { type: "text", text: userPrompt }],
    },
  ];

  const result = await chatWithAI(messages, 0.6, apiKey, apiUrl, modelName, true);

  try {
    const parsed = JSON.parse(result);
    return { questions: parsed.questions || [] };
  } catch {
    throw new Error("AI返回的测试题格式不正确");
  }
}

// 从文件/图片 URL 中识别题目
export async function recognizeQuestionsFromUrls(
  urls: string[],
  questionType: string,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  questions: Array<{
    content: string;
    options?: Array<{ label: string; text: string }>;
    correctAnswer: string;
    explanation: string;
    difficulty: number;
    imageUrl?: string;
    detectedSubject?: string;
    detectedKnowledgePoint?: string;
  }>;
}> {
  const typeDesc =
    questionType === "mixed"
      ? "混合题型（自动混合单选、多选、填空、简答等）"
      : questionType === "single_choice"
        ? "单选题"
        : questionType === "multiple_choice"
          ? "多选题"
          : questionType === "fill_blank"
            ? "填空题"
            : questionType === "short_answer"
              ? "简答题"
              : "论述题";

  const systemPrompt = `你是一个专业的题目识别AI。请仔细阅读用户提供的文件或图片，识别出其中的练习题，并以结构化JSON格式返回。

要求：
1. 从文档/图片中尽可能提取完整的题目内容
2. 选择题必须有4个选项（A/B/C/D），选项内容要完整准确
3. 提供详细的答案解析
4. 每道题标注难度(1-5)，由你根据题目实际难度判断
5. 如果文档中有表格、图片等无法直接读取的内容，请用文本描述替代
6. mixed模式下，必须混合至少2种不同题型
7. **数量由文档中实际包含的题目数量决定，请识别出所有能看清的题目**
8. 如果文档中某道题不完整或看不清，请跳过该题
9. **分析题目所属的学科和考察的具体知识点，并返回在detectedSubject和detectedKnowledgePoint字段中**

请返回JSON格式：
{
  "questions": [
    {
      "content": "题目内容",
      "options": [{"label": "A", "text": "选项A"}, {"label": "B", "text": "选项B"}, {"label": "C", "text": "选项C"}, {"label": "D", "text": "选项D"}],
      "correctAnswer": "A",
      "explanation": "解析",
      "difficulty": 3,
      "detectedSubject": "识别的学科名称，如'数学'、'物理'等",
      "detectedKnowledgePoint": "识别的具体知识点，如'二次函数'等"
    }
  ]
}`;

  const contentBlocks: KimiContent[] = urls.map((url) => {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
    const videoExts = ["mp4", "mov", "avi", "mkv", "webm"];
    if (imageExts.includes(ext)) {
      return { type: "image_url", image_url: { url } };
    }
    if (videoExts.includes(ext)) {
      return { type: "video_url", video_url: { url } };
    }
    return { type: "file_url", file_url: { url } };
  });

  const userPrompt = `请从以下文件中识别出所有${typeDesc}，每道题标注难度(1-5)。如果文档中有多个题目，请全部识别出来。`;

  const messages: KimiMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [...contentBlocks, { type: "text", text: userPrompt }],
    },
  ];

  const result = await chatWithAI(messages, 0.5, apiKey, apiUrl, modelName, true);

  try {
    const parsed = JSON.parse(result);
    return { questions: parsed.questions || [] };
  } catch {
    throw new Error("AI返回的题目数据格式不正确");
  }
}

// AI助手对话（支持上下文）
export async function aiAssistantChat(
  messages: Array<{ role: string; content: string }>,
  contextData?: Record<string, unknown>,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
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

  const result = await chatWithAI(chatMessages, 0.7, apiKey, apiUrl, modelName);
  return result;
}

// 分析试卷的综合难度和知识点考察范围
export async function analyzePaperDifficulty(
  paperTitle: string,
  questions: Array<{
    id: number;
    content: string;
    type: string;
    difficulty: number;
    subjectTitle?: string;
    nodeTitle?: string;
  }>,
  localSubjects?: Array<{
    id: number;
    title: string;
    description?: string;
  }>,
  localNodes?: Array<{
    id: number;
    title: string;
    subjectId: number;
    subjectTitle?: string;
  }>,
  apiKey?: string,
  apiUrl?: string,
  modelName?: string
): Promise<{
  overallDifficulty: number; // 1-5
  difficultyDistribution: {
    easy: number; // 百分比
    medium: number;
    hard: number;
  };
  // 试卷关联的本地学科（从用户本地学科列表中匹配）
  matchedSubjects: Array<{
    id: number;
    title: string;
    relevanceScore: number; // 关联度 0-100
    questionCount: number; // 该学科关联的题目数量
  }>;
  // 试卷考察的本地知识点（从用户本地知识树中匹配）
  matchedNodes: Array<{
    id: number;
    title: string;
    subjectId: number;
    subjectTitle: string;
    questionCount: number;
  }>;
  // 试卷还考察了哪些不在本地知识树中的知识点
  otherKnowledgePoints: string[];
}> {
  const systemPrompt = `你是一个专业的教育评估AI。请分析试卷的题目内容，评估难度，并将试卷内容与用户本地的学科知识树进行智能匹配。

分析要求：
1. 计算试卷整体难度（1-5），基于各题难度的加权平均
2. 分析难度分布：简单/中等/困难题目的比例
3. 将试卷内容与本地学科列表进行匹配：
   - 根据题目内容判断试卷主要属于哪个/哪些学科
   - 从提供的本地学科列表中选择最相关的学科
   - 给出关联度评分（0-100）
4. 将试卷内容与本地知识树节点进行匹配：
   - 识别试卷考察了哪些知识点
   - 从提供的本地知识节点列表中匹配最相关的节点
   - 统计每个知识点对应的题目数量
5. 识别试卷还涉及了哪些不在本地知识树中的知识点

请严格按照JSON格式返回：
{
  "overallDifficulty": 3.5,
  "difficultyDistribution": {
    "easy": 30,
    "medium": 50,
    "hard": 20
  },
  "matchedSubjects": [
    {
      "id": 1,
      "title": "匹配的本地学科名称",
      "relevanceScore": 85,
      "questionCount": 8
    }
  ],
  "matchedNodes": [
    {
      "id": 10,
      "title": "匹配的本地知识点名称",
      "subjectId": 1,
      "subjectTitle": "所属学科",
      "questionCount": 3
    }
  ],
  "otherKnowledgePoints": ["未匹配到的知识点1", "未匹配到的知识点2"]
}`;

  const questionsInfo = questions.map((q) => ({
    content: q.content.slice(0, 200),
    type: q.type,
    difficulty: q.difficulty,
    subject: q.subjectTitle,
    node: q.nodeTitle,
  }));

  const userPrompt = `请分析以下试卷，并与本地学科知识树进行匹配：

试卷标题：${paperTitle}
题目数量：${questions.length}

题目列表：
${JSON.stringify(questionsInfo, null, 2)}

用户本地学科列表：
${localSubjects ? JSON.stringify(localSubjects.map(s => ({ id: s.id, title: s.title })), null, 2) : "未提供"}

用户本地知识树节点：
${localNodes ? JSON.stringify(localNodes.map(n => ({ id: n.id, title: n.title, subjectId: n.subjectId, subjectTitle: n.subjectTitle })), null, 2) : "未提供"}

请分析该试卷的难度分布，并从本地学科和知识节点中匹配最相关的内容。注意：matchedSubjects 和 matchedNodes 必须从提供的本地列表中选择。`;

  const result = await chatWithAI(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    0.5,
    apiKey,
    apiUrl,
    modelName,
    true
  );

  try {
    const parsed = JSON.parse(result);
    return {
      overallDifficulty: parsed.overallDifficulty || 3,
      difficultyDistribution: parsed.difficultyDistribution || { easy: 33, medium: 34, hard: 33 },
      matchedSubjects: parsed.matchedSubjects || [],
      matchedNodes: parsed.matchedNodes || [],
      otherKnowledgePoints: parsed.otherKnowledgePoints || [],
    };
  } catch {
    throw new Error("AI返回的试卷分析数据格式不正确");
  }
}