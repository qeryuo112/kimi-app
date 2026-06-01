import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { subjectRouter } from "./subject-router";
import { knowledgeRouter } from "./knowledge-router";
import { skillRouter } from "./skill-router";
import { studyRouter } from "./study-router";
import { aiRouter } from "./ai-router";
import { settingsRouter } from "./settings-router";
import { planRouter } from "./plan-router";
import { questionRouter } from "./question-router";
import { todoRouter } from "./todo-router";
import { examRouter } from "./exam-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  subject: subjectRouter,
  knowledge: knowledgeRouter,
  skill: skillRouter,
  study: studyRouter,
  ai: aiRouter,
  settings: settingsRouter,
  plan: planRouter,
  question: questionRouter,
  todo: todoRouter,
  exam: examRouter,
});

export type AppRouter = typeof appRouter;
