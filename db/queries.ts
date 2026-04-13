// ============================================================
// db/queries.ts — Quizoi Database Query Functions
// All server-side data access goes through these functions.
// Import in server/routes/*.ts files.
// ============================================================

import { db } from './client';
import {
  categories,
  quizzes,
  questions,
  answers,
  quizSessions,
  siteSettings,
  pageContents,
  type NewQuiz,
  type NewQuestion,
  type NewAnswer,
  type NewCategory,
  type NewQuizSession,
} from './schema';
import { eq, desc, asc, and, sql, count, isNull, isNotNull } from 'drizzle-orm';

// ─── Categories ───────────────────────────────────────────────────────────────

/** Fetch all categories ordered by name */
export async function getAllCategories() {
  return db.select().from(categories).orderBy(asc(categories.name));
}

/** Fetch a single category by slug */
export async function getCategoryBySlug(slug: string) {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/** Create a new category */
export async function createCategory(data: NewCategory) {
  const rows = await db.insert(categories).values(data).returning();
  return rows[0];
}

/** Update a category */
export async function updateCategory(
  id: string,
  data: Partial<NewCategory>,
) {
  const rows = await db
    .update(categories)
    .set(data)
    .where(eq(categories.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Delete a category (only if no quizzes reference it) */
export async function deleteCategory(id: string) {
  await db.delete(categories).where(eq(categories.id, id));
}

// ─── Quizzes ──────────────────────────────────────────────────────────────────

/** Fetch all published quizzes for the homepage, ordered by play count */
export async function getPublishedQuizzes(limit = 50) {
  return db
    .select()
    .from(quizzes)
    .where(eq(quizzes.status, 'PUBLISHED'))
    .orderBy(desc(quizzes.playCount))
    .limit(limit);
}

/** Fetch latest published quizzes (for "New This Week" section) */
export async function getLatestQuizzes(limit = 6) {
  return db
    .select()
    .from(quizzes)
    .where(eq(quizzes.status, 'PUBLISHED'))
    .orderBy(desc(quizzes.createdAt))
    .limit(limit);
}

/** Fetch published quizzes by category */
export async function getQuizzesByCategory(categoryId: string, limit = 12) {
  return db
    .select()
    .from(quizzes)
    .where(
      and(
        eq(quizzes.status, 'PUBLISHED'),
        eq(quizzes.categoryId, categoryId),
      ),
    )
    .orderBy(desc(quizzes.playCount))
    .limit(limit);
}

/** Fetch a single quiz by slug (published only — for public pages) */
export async function getPublishedQuizBySlug(slug: string) {
  const rows = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.slug, slug), eq(quizzes.status, 'PUBLISHED')))
    .limit(1);
  return rows[0] ?? null;
}

/** Fetch a single quiz by slug (any status — for admin) */
export async function getQuizBySlug(slug: string) {
  const rows = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/** Fetch a quiz with all its questions and answers (for admin editor) */
export async function getQuizWithQuestions(quizId: string) {
  const quiz = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quiz[0]) return null;

  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.order));

  const questionIds = qs.map((q) => q.id);
  const ans =
    questionIds.length > 0
      ? await db
          .select()
          .from(answers)
          .where(sql`${answers.questionId} = ANY(${sql.raw(`ARRAY[${questionIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})`)
          .orderBy(asc(answers.order))
      : [];

  return {
    ...quiz[0],
    questions: qs.map((q) => ({
      ...q,
      answers: ans.filter((a) => a.questionId === q.id),
    })),
  };
}

/** Admin: fetch all quizzes (all statuses) */
export async function getAllQuizzes() {
  return db
    .select()
    .from(quizzes)
    .orderBy(desc(quizzes.updatedAt));
}

/** Create a new quiz */
export async function createQuiz(data: NewQuiz) {
  const rows = await db.insert(quizzes).values(data).returning();
  return rows[0];
}

/** Update a quiz */
export async function updateQuiz(id: string, data: Partial<NewQuiz>) {
  const rows = await db
    .update(quizzes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(quizzes.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Toggle quiz status between DRAFT and PUBLISHED */
export async function toggleQuizStatus(id: string) {
  const quiz = await db
    .select({ status: quizzes.status })
    .from(quizzes)
    .where(eq(quizzes.id, id))
    .limit(1);

  if (!quiz[0]) return null;

  const newStatus = quiz[0].status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
  return updateQuiz(id, { status: newStatus });
}

/** Delete a quiz and all its questions/answers (CASCADE) */
export async function deleteQuiz(id: string) {
  await db.delete(quizzes).where(eq(quizzes.id, id));
}

// ─── Questions ────────────────────────────────────────────────────────────────

/** Fetch a single question by quiz slug + order number (for question page SSR) */
export async function getQuestionByOrder(quizSlug: string, order: number) {
  // Use getQuizBySlug (any status) so draft quizzes can be previewed by admin
  const quiz = await getQuizBySlug(quizSlug);
  if (!quiz) return null;

  const rows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.quizId, quiz.id), eq(questions.order, order)))
    .limit(1);

  if (!rows[0]) return null;

  const ans = await db
    .select()
    .from(answers)
    .where(eq(answers.questionId, rows[0].id))
    .orderBy(asc(answers.order));

  return { ...rows[0], answers: ans, quiz };
}

/** Fetch all questions for a quiz (ordered) */
export async function getQuestionsByQuizId(quizId: string) {
  return db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.order));
}

/** Create a question */
export async function createQuestion(data: NewQuestion) {
  const rows = await db.insert(questions).values(data).returning();
  return rows[0];
}

/** Update a question */
export async function updateQuestion(id: string, data: Partial<NewQuestion>) {
  const rows = await db
    .update(questions)
    .set(data)
    .where(eq(questions.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Delete a question */
export async function deleteQuestion(id: string) {
  await db.delete(questions).where(eq(questions.id, id));
}

// ─── Answers ──────────────────────────────────────────────────────────────────

/** Create an answer */
export async function createAnswer(data: NewAnswer) {
  const rows = await db.insert(answers).values(data).returning();
  return rows[0];
}

/** Update an answer */
export async function updateAnswer(id: string, data: Partial<NewAnswer>) {
  const rows = await db
    .update(answers)
    .set(data)
    .where(eq(answers.id, id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Increment votes_count for an answer.
 * Called every time a user submits an answer — powers the "42% chose this" stats.
 * IMPORTANT: This must be called server-side to prevent client-side manipulation.
 */
export async function incrementAnswerVotes(answerId: string) {
  const rows = await db
    .update(answers)
    .set({ votesCount: sql`${answers.votesCount} + 1` })
    .where(eq(answers.id, answerId))
    .returning({ votesCount: answers.votesCount });
  return rows[0]?.votesCount ?? 0;
}

/** Fetch all answers for a question with vote percentages */
export async function getAnswersWithStats(questionId: string) {
  const ans = await db
    .select()
    .from(answers)
    .where(eq(answers.questionId, questionId))
    .orderBy(asc(answers.order));

  const totalVotes = ans.reduce((sum, a) => sum + a.votesCount, 0);

  return ans.map((a) => ({
    ...a,
    votePct: totalVotes > 0 ? Math.round((a.votesCount / totalVotes) * 100) : 0,
  }));
}

/** Delete an answer */
export async function deleteAnswer(id: string) {
  await db.delete(answers).where(eq(answers.id, id));
}

// ─── Quiz Sessions (Analytics) ────────────────────────────────────────────────

/**
 * Start a new quiz session.
 * Called on the first question page load.
 * session_id comes from the anonymous cookie set by the server.
 */
export async function startQuizSession(data: NewQuizSession) {
  const rows = await db.insert(quizSessions).values(data).returning();
  return rows[0];
}

/**
 * Update the last_question field as the user progresses.
 * Called on every question page load.
 */
export async function updateSessionProgress(
  sessionId: string,
  quizId: string,
  lastQuestion: number,
) {
  await db
    .update(quizSessions)
    .set({ lastQuestion })
    .where(
      and(
        eq(quizSessions.sessionId, sessionId),
        eq(quizSessions.quizId, quizId),
      ),
    );
}

/**
 * Mark a session as completed.
 * Called when the user reaches the /result page.
 */
export async function completeQuizSession(
  sessionId: string,
  quizId: string,
  score: number,
) {
  await db
    .update(quizSessions)
    .set({ completedAt: new Date(), score })
    .where(
      and(
        eq(quizSessions.sessionId, sessionId),
        eq(quizSessions.quizId, quizId),
        isNull(quizSessions.completedAt),
      ),
    );
}

// ─── Analytics Queries ────────────────────────────────────────────────────────

/** Completion rate for all quizzes (admin dashboard) */
export async function getCompletionRates() {
  return db.execute(sql`
    SELECT
      q.id,
      q.title,
      q.slug,
      COUNT(qs.id)                                                      AS total_starts,
      COUNT(qs.completed_at)                                            AS completions,
      ROUND(COUNT(qs.completed_at) * 100.0 / NULLIF(COUNT(qs.id), 0), 1) AS completion_rate,
      ROUND(AVG(
        CASE WHEN qs.completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (qs.completed_at - qs.started_at))
        END
      ))                                                                AS avg_seconds
    FROM quizzes q
    LEFT JOIN quiz_sessions qs ON qs.quiz_id = q.id
    GROUP BY q.id, q.title, q.slug
    ORDER BY total_starts DESC
  `);
}

/** Per-question drop-off for a specific quiz */
export async function getDropOffStats(quizId: string) {
  return db.execute(sql`
    SELECT
      q.title,
      qs.last_question,
      COUNT(*)                                                                          AS drop_off_count,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY qs.quiz_id), 1)        AS pct
    FROM quiz_sessions qs
    JOIN quizzes q ON q.id = qs.quiz_id
    WHERE qs.quiz_id = ${quizId}
      AND qs.completed_at IS NULL
    GROUP BY q.title, qs.last_question, qs.quiz_id
    ORDER BY qs.last_question
  `);
}

/** Daily stats for the last N days (admin analytics chart) */
export async function getDailyStats(days = 30) {
  // Use a safer way to pass the interval to avoid SQL injection or syntax errors
  const interval = `${days} days`;
  return db.execute(sql`
    SELECT
      DATE(started_at AT TIME ZONE 'UTC')  AS date,
      COUNT(*)                             AS sessions,
      COUNT(completed_at)                  AS completions
    FROM quiz_sessions
    WHERE started_at >= NOW() - CAST(${interval} AS INTERVAL)
    GROUP BY DATE(started_at AT TIME ZONE 'UTC')
    ORDER BY date ASC
  `);
}

// ─── Site Settings ────────────────────────────────────────────────────────────
// Uses the Drizzle ORM for core columns (always present) and gracefully
// ignores optional columns (analytics_id, ad_slot_*) that may not yet
// exist in the live database until migration 0002 is applied.

/** camelCase fields that map to optional DB columns (added in migration 0002) */
const OPTIONAL_FIELDS = new Set([
  'analyticsId', 'adSlotLeaderboard', 'adSlotRectangle', 'adSlotLargeRectangle', 'adSlotBanner',
]);

/** Cache: which optional columns actually exist in the live DB */
let _optionalColsCache: Set<string> | null = null;

async function getOptionalCols(): Promise<Set<string>> {
  if (_optionalColsCache !== null) return _optionalColsCache;
  try {
    const rows = await db.execute(
      sql`SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'site_settings'
            AND column_name IN (
              'analytics_id','ad_slot_leaderboard','ad_slot_rectangle',
              'ad_slot_large_rectangle','ad_slot_banner'
            )`
    ) as unknown as Array<{ column_name: string }>;
    // postgres-js returns the rows directly as an array
    const names = Array.isArray(rows) ? rows.map(r => r.column_name) : [];
    _optionalColsCache = new Set(names);
  } catch {
    _optionalColsCache = new Set();
  }
  return _optionalColsCache;
}

/** camelCase field → snake_case column */
const FIELD_COL: Record<string, string> = {
  analyticsId:        'analytics_id',
  adSlotLeaderboard:  'ad_slot_leaderboard',
  adSlotRectangle:    'ad_slot_rectangle',
  adSlotLargeRectangle: 'ad_slot_large_rectangle',
  adSlotBanner:       'ad_slot_banner',
};

/** Fetch the single site settings row */
export async function getSiteSettings() {
  // Always fetch core columns via Drizzle ORM
  const rows = await db
    .select({
      id:                 siteSettings.id,
      siteName:           siteSettings.siteName,
      siteDescription:    siteSettings.siteDescription,
      adsensePublisherId: siteSettings.adsensePublisherId,
      adsenseAutoAds:     siteSettings.adsenseAutoAds,
      headerCode:         siteSettings.headerCode,
      footerCode:         siteSettings.footerCode,
      customCss:          siteSettings.customCss,
      maintenanceMode:    siteSettings.maintenanceMode,
      updatedAt:          siteSettings.updatedAt,
    })
    .from(siteSettings)
    .limit(1);

  if (!rows.length) return null;

  const base = rows[0];

  // Build result with optional columns defaulting to empty string
  // (these are not in the Drizzle schema until migration 0002 is applied)
  const result: typeof base & {
    analyticsId: string;
    adSlotLeaderboard: string;
    adSlotRectangle: string;
    adSlotLargeRectangle: string;
    adSlotBanner: string;
  } = {
    ...base,
    analyticsId:          '',
    adSlotLeaderboard:    '',
    adSlotRectangle:      '',
    adSlotLargeRectangle: '',
    adSlotBanner:         '',
  };

  // If optional columns exist in the DB, fetch them with a raw query
  const optCols = await getOptionalCols();
  if (optCols.size > 0) {
    const colList = [...optCols].join(', ');
    try {
      const extra = await db.execute(
        sql`SELECT id, ${sql.raw(colList)} FROM site_settings WHERE id = ${base.id} LIMIT 1`
      ) as unknown as Array<Record<string, string>>;
      if (Array.isArray(extra) && extra.length) {
        const r = extra[0];
        if (optCols.has('analytics_id'))            result.analyticsId          = r.analytics_id          ?? '';
        if (optCols.has('ad_slot_leaderboard'))     result.adSlotLeaderboard    = r.ad_slot_leaderboard    ?? '';
        if (optCols.has('ad_slot_rectangle'))       result.adSlotRectangle      = r.ad_slot_rectangle      ?? '';
        if (optCols.has('ad_slot_large_rectangle')) result.adSlotLargeRectangle = r.ad_slot_large_rectangle ?? '';
        if (optCols.has('ad_slot_banner'))          result.adSlotBanner         = r.ad_slot_banner         ?? '';
      }
    } catch { /* ignore — optional cols */ }
  }

  return result;
}

/** Update site settings (upsert) — only writes columns that exist in the live DB */
export async function upsertSiteSettings(
  data: Partial<typeof siteSettings.$inferInsert> & {
    // Optional fields managed via raw SQL (not in Drizzle schema until migration 0002)
    analyticsId?: string;
    adSlotLeaderboard?: string;
    adSlotRectangle?: string;
    adSlotLargeRectangle?: string;
    adSlotBanner?: string;
  },
) {
  const existing = await getSiteSettings();

  // Separate core fields (always writable) from optional fields
  const coreData: Partial<typeof siteSettings.$inferInsert> = {};
  const optData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (OPTIONAL_FIELDS.has(key)) {
      optData[key] = value;
    } else {
      (coreData as Record<string, unknown>)[key] = value;
    }
  }

  if (existing) {
    // UPDATE core columns via Drizzle ORM
    if (Object.keys(coreData).length > 0) {
      await db
        .update(siteSettings)
        .set({ ...coreData, updatedAt: new Date() })
        .where(eq(siteSettings.id, existing.id));
    }

    // UPDATE optional columns one-by-one via raw SQL (only if they exist in the DB)
    const optCols = await getOptionalCols();
    for (const [field, value] of Object.entries(optData)) {
      const col = FIELD_COL[field];
      if (!col || !optCols.has(col)) continue;
      try {
        await db.execute(
          sql`UPDATE site_settings SET ${sql.raw(col)} = ${value as string} WHERE id = ${existing.id}`
        );
      } catch { /* ignore — optional col may still be missing */ }
    }
  } else {
    // INSERT — only use core fields to guarantee compatibility
    await db.insert(siteSettings).values(coreData as typeof siteSettings.$inferInsert);
  }

  return (await getSiteSettings()) ?? ({} as typeof siteSettings.$inferSelect);
}

// ─// ─── Page Contents ────────────────────────────────────────────────────────

/** Fetch all static pages */
export async function getAllPages() {
  return db.select().from(pageContents).orderBy(asc(pageContents.title));
}

/** Create a new static page */
export async function createPage(
  data: typeof pageContents.$inferInsert,
) {
  const rows = await db.insert(pageContents).values(data).returning();
  return rows[0];
}

/** Update a static page by id */
export async function updatePage(
  id: string,
  data: Partial<typeof pageContents.$inferInsert>,
) {
  const rows = await db
    .update(pageContents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(pageContents.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Delete a static page by id */
export async function deletePage(id: string) {
  await db.delete(pageContents).where(eq(pageContents.id, id));
}
