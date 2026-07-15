import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import katex from "katex";

const root = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the icpc-trainer product home", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /icpc-trainer/i);
  assert.match(html, /今日训练/);
  assert.match(html, /今日目标/);
  assert.match(html, /仅按 AC 自动统计/);
  assert.match(html, /历届补题/);
  assert.match(html, /思维题推荐/);
  assert.match(html, /待 VP/);
  assert.doesNotMatch(html, /手动记一题/);
  assert.match(html, /RATING/);
  assert.match(html, /constructive algorithms/);
  assert.doesNotMatch(html, /最近完成/);
  assert.doesNotMatch(html, /中文精选题/);
  assert.doesNotMatch(html, /WORKSPACE|CODEFORCES API/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("counts unique completed problems automatically without unsolved or manual activity", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /canonicalProblemCode/);
  assert.match(page, /rememberFirstCompletion/);
  assert.match(page, /item\.outcome === "unsolved"/);
  assert.match(page, /firstCompletion/);
  assert.match(page, /count=1000/);
  assert.doesNotMatch(page, /manualActivity|recordProblem|savePersistentJson/);
});

test("ships an automatic Shenyang sprint loop driven by persistent submissions", async () => {
  const [page, backend] = await Promise.all([
    readFile(new URL("app/sprint/page.tsx", root), "utf8"),
    readFile(new URL("backend/server.mjs", root), "utf8"),
  ]);
  assert.match(page, /loadPlatformSubmissions/);
  assert.match(page, /startArchivePrewarm/);
  assert.match(page, /站内题面 · 中文切换 · 直接提交/);
  assert.match(page, /由平台自动记录/);
  assert.match(page, /查看代码与评测记录/);
  assert.doesNotMatch(page, /toggleTask/);
  assert.match(backend, /shenyang-sprint/);

  const response = await render("/sprint");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /沈阳邀请赛冲刺/);
  assert.match(html, /今日计划/);
  assert.match(html, /准确中文/);
  assert.match(html, /进入整场 VP/);
});

test("uses a concise white, pink, and violet visual system across the product", async () => {
  const styles = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(styles, /White, pink and violet product theme/);
  assert.match(styles, /--paper:#fffafd/);
  assert.match(styles, /--blue:#8557d9/);
  assert.match(styles, /--lime:#e987b8/);
  assert.match(styles, /body\{[^}]*font-size:16px/);
  assert.match(styles, /small\{font-size:12px!important/);
  assert.match(styles, /\.dashboard-archive-section/);
});

test("ships a readable contest template catalog and dedicated code reader", async () => {
  const [catalog, expandedCatalog, page, detail, styles] = await Promise.all([
    readFile(new URL("app/templates/data.ts", root), "utf8"),
    readFile(new URL("app/templates/expanded-data.ts", root), "utf8"),
    readFile(new URL("app/templates/page.tsx", root), "utf8"),
    readFile(new URL("app/templates/[slug]/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  const templateCount = (catalog.match(/^    slug: "/gm) ?? []).length
    + (expandedCatalog.match(/^    slug: "/gm) ?? []).length;
  assert.equal(templateCount, 32);
  assert.match(catalog, /BinaryLiftingLCA/);
  assert.match(catalog, /TarjanSCC/);
  assert.match(catalog, /ModInt/);
  assert.match(catalog, /\/\/ BFS 建树/);
  assert.match(expandedCatalog, /ContestStarter/);
  assert.match(expandedCatalog, /Manacher/);
  assert.match(expandedCatalog, /SuffixArray/);
  assert.match(expandedCatalog, /BFPRTSelection/);
  assert.match(expandedCatalog, /MorrisInorder/);
  assert.match(page, /打开模板/);
  assert.match(page, /独立模块/);
  assert.doesNotMatch(page, /template-code-preview/);
  assert.match(detail, /接口速查/);
  assert.match(detail, /template-code-line/);
  assert.match(detail, /复制完整代码/);
  assert.match(styles, /font:500 15px\/26px var\(--font-geist-mono\)/);

  const catalogResponse = await render("/templates");
  assert.equal(catalogResponse.status, 200);
  const catalogHtml = await catalogResponse.text();
  assert.match(catalogHtml, /份精选模板/);
  assert.match(catalogHtml, /打开模板/);

  const detailResponse = await render("/templates/dijkstra");
  assert.equal(detailResponse.status, 200);
  const detailHtml = await detailResponse.text();
  assert.match(detailHtml, /非负权最短路/);
  assert.match(detailHtml, /复制完整代码/);
  assert.match(detailHtml, /恢复最短路径/);
});

test("keeps twenty readable offline statement fallback records", async () => {
  const source = await readFile(new URL("app/data/problems.ts", root), "utf8");
  assert.equal((source.match(/\{ code: "CF /g) ?? []).length, 20);
  assert.match(source, /titleZh/);
  assert.match(source, /summaryZh/);
});

test("ships readable Chinese fallbacks and a QOJ-like cached statement reader", async () => {
  const [statements, detailPage, statementClient] = await Promise.all([
    readFile(new URL("app/data/problem-statements.ts", root), "utf8"),
    readFile(new URL("app/problem/[code]/page.tsx", root), "utf8"),
    readFile(new URL("app/lib/statement-client.ts", root), "utf8"),
  ]);
  assert.equal((statements.match(/^    timeLimitSeconds:/gm) ?? []).length, 21);
  assert.match(statements, /"2176c"/);
  assert.match(statements, /奇数过程/);
  assert.match(statements, /examples: ProblemExample\[\]/);
  assert.match(detailPage, /原题面默认显示/);
  assert.match(detailPage, /中文题面/);
  assert.match(detailPage, /样例输入/);
  assert.match(detailPage, /样例输出/);
  assert.match(statementClient, /ICPC_TRAINER_FETCH_STATEMENT/);
  assert.match(statementClient, /图片文字翻译/);
  assert.match(statementClient, /window\.Translator/);
  assert.match(statementClient, /katex\.render/);
  assert.match(statementClient, /tex-span/);
  assert.match(statementClient, /cacheBrowserTranslation/);
  assert.match(detailPage, /中文题面已保存到当前设备/);
  assert.match(detailPage, /中文翻译正在排队重试/);
  const response = await render("/problem/2176C");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /奇数过程/);
  assert.match(html, /原题面/);
  assert.match(html, /中文题面/);
  assert.match(html, /首次打开自动导入/);
});

test("ships a constrained Manifest V3 statement and submit bridge", async () => {
  const [manifestText, background, bridge, fill, qojFill, luoguFill] = await Promise.all([
    readFile(new URL("extension/manifest.json", root), "utf8"),
    readFile(new URL("extension/background.js", root), "utf8"),
    readFile(new URL("extension/trainer-bridge.js", root), "utf8"),
    readFile(new URL("extension/codeforces-fill.js", root), "utf8"),
    readFile(new URL("extension/qoj-fill.js", root), "utf8"),
    readFile(new URL("extension/luogu-fill.js", root), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.host_permissions.includes("https://codeforces.com/*"));
  assert.ok(manifest.host_permissions.includes("https://contest.ucup.ac/*"));
  assert.ok(manifest.host_permissions.includes("https://qoj.ac/*"));
  assert.ok(manifest.host_permissions.includes("https://www.luogu.com.cn/*"));
  assert.ok(!manifest.permissions.includes("cookies"));
  assert.equal(manifest.version, "1.4.0");
  assert.ok(!manifest.host_permissions.includes("https://*.chatgpt.site/*"));
  assert.ok(manifest.host_permissions.includes("https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site/*"));
  assert.match(background, /FETCH_CODEFORCES_STATEMENT/);
  assert.match(background, /gym\\\/\\d\+\\\/problem/);
  assert.match(background, /problem-statement/);
  assert.match(bridge, /ICPC_TRAINER_SUBMIT_RESULT/);
  assert.match(bridge, /ICPC_TRAINER_ARCHIVE_SUBMIT/);
  assert.match(qojFill, /input-answer_answer_editor/);
  assert.match(qojFill, /answer_answer_language/);
  assert.match(`${bridge}\n${fill}\n${qojFill}\n${luoguFill}`, /autoSubmit/);
  assert.match(fill, /submitButton\.click\(\)/);
  assert.match(qojFill, /button-submit-answer/);
  assert.match(background, /active: false/);
  assert.match(background, /JUDGE_SUBMIT_STATUS/);
  assert.match(qojFill, /phase === "tracking"/);
  assert.match(qojFill, /"judged"/);
  assert.match(fill, /phase === "tracking"/);
  assert.match(fill, /status-verdict-cell/);
  assert.match(fill, /"judged"/);
  assert.match(luoguFill, /fe\/api\/problem\/submit/);
  assert.match(luoguFill, /X-CSRF-TOKEN/);
  assert.match(luoguFill, /phase === "tracking"/);
  assert.match(luoguFill, /status === 12/);
  assert.match(bridge, /archiveContestId/);
  assert.match(fill, /archiveContestId/);
  assert.match(background, /archiveContestId/);
  assert.match(background, /trainerSubmissionResults/);
  assert.match(background, /pendingJudgeSubmissions/);
  assert.match(background, /GET_PENDING_SUBMISSION/);
  assert.match(background, /CHECK_JUDGE_SESSIONS/);
  assert.match(background, /checkJudgeSession/);
  assert.match(background, /judgeTabId/);
  assert.match(background, /url: "about:blank"/);
  assert.match(bridge, /replayStoredResults/);
  assert.match(bridge, /ICPC_TRAINER_HEALTH_CHECK/);
  assert.match(bridge, /ICPC_TRAINER_HEALTH_RESULT/);
  assert.match(bridge, /\.\.\.result, source: "icpc-trainer-extension", type: "ICPC_TRAINER_SUBMIT_RESULT"/);
});

test("renders proactive submission readiness checks and the durable source boundary", async () => {
  const response = await render("/extension");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /赛前检查/);
  assert.match(html, /Codeforces/);
  assert.match(html, /Universal Cup \/ QOJ/);
  assert.match(html, /提交源码保存在平台数据库/);
  assert.match(html, /icpc-trainer-extension\.zip/);
});

test("ships live multiplayer VP generation, in-platform solving, frozen standings, and medals", async () => {
  const [route, standingsRoute, standingsHelper, recommendationRoute, page, catalog, detail, backendScoring] = await Promise.all([
    readFile(new URL("app/api/vp/generate/route.ts", root), "utf8"),
    readFile(new URL("app/api/vp/standings/route.ts", root), "utf8"),
    readFile(new URL("app/lib/vp-original-standings.ts", root), "utf8"),
    readFile(new URL("app/api/codeforces/recommendations/route.ts", root), "utf8"),
    readFile(new URL("app/vp/page.tsx", root), "utf8"),
    readFile(new URL("app/problem/page.tsx", root), "utf8"),
    readFile(new URL("app/problem/[code]/page.tsx", root), "utf8"),
    readFile(new URL("backend/vp-scoring.mjs", root), "utf8"),
  ]);
  assert.match(route, /getUserSubmissions/);
  assert.match(route, /pickRandomSet/);
  assert.match(route, /pickThinkingSet/);
  assert.match(route, /THINKING_TAGS/);
  assert.match(route, /thinkingRatio/);
  assert.match(route, /replayableSourcePool/);
  assert.match(route, /getContestStandings/);
  assert.match(route, /getProblemset\(true\)/);
  assert.match(route, /pickMirror/);
  assert.match(route, /pickCombined/);
  assert.match(route, /sourceContests/);
  assert.match(standingsHelper, /wrongAttempts/);
  assert.match(standingsHelper, /pendingAttempts/);
  assert.match(standingsRoute, /15_000/);
  assert.match(standingsRoute, /15_000, true/);
  assert.match(standingsHelper, /penalty/);
  assert.match(standingsRoute, /buildOriginalVpRows/);
  assert.match(standingsRoute, /freezeAtSeconds/);
  assert.match(standingsRoute, /participantRows/);
  assert.match(standingsRoute, /medalCutoffs/);
  assert.match(standingsRoute, /sourceBoards/);
  assert.match(standingsRoute, /selectedProblems/);
  assert.match(standingsHelper, /bestSubmissionTimeSeconds/);
  assert.match(standingsHelper, /problem\.contestId === source\.contest\.id/);
  assert.match(recommendationRoute, /targetRating/);
  assert.match(page, /ShallowDream2/);
  assert.match(page, /实时榜单/);
  assert.match(page, /思维题占比/);
  assert.match(page, /题目列表/);
  assert.match(page, /队伍提交记录/);
  assert.match(page, /fetchTeamSubmissions/);
  assert.match(page, /loadPlatformSubmissions/);
  assert.match(page, /detailHref: `\/submissions\//);
  assert.match(page, /platformJudgeIds/);
  assert.match(page, /站内提交优先显示并可打开源码/);
  assert.doesNotMatch(page, /source\.url[^\n]*target="_blank"/);
  assert.match(page, /最后 1 小时封榜/);
  assert.match(page, /总罚时/);
  assert.match(page, /总用时/);
  assert.match(page, /金奖前 10%/);
  assert.match(page, /vp-final-result/);
  assert.match(page, /pollAfterSeconds/);
  assert.match(page, /多场组合/);
  assert.match(page, /vp-room-tabs/);
  assert.match(page, /只看我的队伍/);
  assert.match(page, /relativeSubmissionTime/);
  assert.match(detail, /VP · Problem/);
  assert.match(detail, /直接提交/);
  assert.match(detail, /autoSubmit: true/);
  assert.match(detail, /返回实时榜单/);
  assert.match(detail, /或直接粘贴代码/);
  assert.match(backendScoring, /teams \* 0\.1/);
  assert.match(backendScoring, /teams \* 0\.2/);
  assert.match(backendScoring, /teams \* 0\.3/);
  assert.match(backendScoring, /lastSolvedMinutes/);
  assert.match(catalog, /个性化推荐/);
  assert.match(catalog, /目标 Rating/);
  assert.match(catalog, /selectedTags/);
  const response = await render("/vp");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /自由组卷/);
  assert.match(html, />60%<\/option>/);
});

test("ships historical ICPC upsolving with timestamp-replayed real standings", async () => {
  const [catalog, page, problemPage, statementClient, statementManifest, statementA, statementM, importer, route, scoreboard, backendScoreboard] = await Promise.all([
    readFile(new URL("app/data/archive-contests.ts", root), "utf8"),
    readFile(new URL("app/vp/archive/page.tsx", root), "utf8"),
    readFile(new URL("app/vp/archive/problem/page.tsx", root), "utf8"),
    readFile(new URL("app/lib/archive-statement-client.ts", root), "utf8"),
    readFile(new URL("public/archive-statements/2026-shenzhen-invitational/manifest.json", root), "utf8"),
    readFile(new URL("public/archive-statements/2026-shenzhen-invitational/A.json", root), "utf8"),
    readFile(new URL("public/archive-statements/2026-shenzhen-invitational/M.json", root), "utf8"),
    readFile(new URL("scripts/import_shenzhen_statements.py", root), "utf8"),
    readFile(new URL("app/api/archive/scoreboard/route.ts", root), "utf8"),
    readFile(new URL("app/lib/archive-scoreboard.ts", root), "utf8"),
    readFile(new URL("backend/archive-scoreboards.mjs", root), "utf8"),
  ]);
  assert.equal((catalog.match(/boardPath: "icpc\//g) ?? []).length, 23);
  assert.equal((catalog.match(/boardPath: "ccpc\//g) ?? []).length, 1);
  assert.equal((catalog.match(/boardPath: "provincial-contest\//g) ?? []).length, 2);
  assert.match(catalog, /2026-shandong-provincial/);
  assert.match(catalog, /qojContestId: 3588/);
  assert.match(catalog, /17753, 17754, 17755/);
  assert.match(catalog, /archiveProblemHref/);
  assert.match(catalog, /archiveContestIntegrated/);
  assert.match(catalog, /qojProblemIds: \[18307, 18308, 18309/);
  assert.match(catalog, /qojProblemIds: \[10486, 10487, 10488/);
  assert.match(catalog, /qojContestId: 3169/);
  assert.match(catalog, /qojContestId: 1913/);
  assert.match(catalog, /qojContestId: 1885/);
  assert.match(catalog, /qojContestId: 1894/);
  assert.match(catalog, /type: "省赛"/);
  assert.match(catalog, /2026-wuhan-invitational/);
  assert.match(catalog, /2025-chengdu/);
  assert.match(catalog, /2024-nanjing/);
  assert.match(catalog, /gymId: 105143/);
  assert.match(catalog, /gymId: 106554/);
  assert.match(page, /同时间轴真实榜单/);
  assert.match(page, /同时间轴真实榜单/);
  assert.match(page, /URLSearchParams\(window\.location\.search\)/);
  assert.match(page, /题目列表/);
  assert.match(page, /archiveProblemHref/);
  assert.match(page, /archive-room-tabs/);
  assert.match(page, /队伍提交记录/);
  assert.match(page, /ArchiveSubmission/);
  assert.match(page, /正在准备整场题面/);
  assert.match(page, /prewarmBySlot/);
  assert.match(page, /medalForRank/);
  assert.match(page, /比赛结束后自动揭榜/);
  assert.match(page, /总罚时/);
  assert.match(page, /总用时/);
  assert.match(page, /finishedAt/);
  assert.match(page, /archive-vp-history/);
  assert.match(page, /我的历届 VP/);
  assert.match(page, /继续 VP/);
  assert.match(page, /题面与提交已接入/);
  assert.doesNotMatch(page, />\+ WA</);
  assert.doesNotMatch(page, />标记 AC</);
  assert.match(page, /同时间轴真实榜单/);
  assert.match(problemPage, /正文、样例与图片已从官方题册提取/);
  assert.match(problemPage, /复制输入/);
  assert.match(problemPage, /提交代码/);
  assert.match(problemPage, /或直接粘贴代码/);
  assert.match(problemPage, /请选择代码文件或直接粘贴代码/);
  assert.match(problemPage, /ICPC_TRAINER_ARCHIVE_SUBMIT/);
  assert.match(problemPage, /ArchiveSubmission/);
  assert.match(problemPage, /提交后自动更新/);
  assert.doesNotMatch(problemPage, />\+ WA</);
  assert.doesNotMatch(problemPage, />标记 AC</);
  assert.doesNotMatch(problemPage, /className="code-editor"/);
  assert.match(problemPage, /返回实时榜单/);
  assert.match(problemPage, /ARCHIVE_SESSION_EVENT/);
  assert.match(problemPage, /ArchiveStatementView/);
  assert.match(problemPage, /下载原始 PDF/);
  assert.doesNotMatch(problemPage, /<iframe/);
  assert.match(statementClient, /force-cache/);
  assert.match(statementClient, /\/archive\/statements/);
  assert.match(statementClient, /startArchivePrewarm/);
  assert.match(statementClient, /loadArchivePrewarm/);
  assert.equal((statementManifest.match(/"slot":/g) ?? []).length, 13);
  assert.match(statementA, /来自陈教授的问候/);
  assert.match(statementA, /A-1\.jpg/);
  assert.match(statementA, /imageTextZh/);
  assert.match(statementM, /博物馆奇妙夜/);
  assert.match(statementM, /M-1\.png/);
  assert.match(importer, /pdfplumber/);
  assert.match(importer, /official-pdf-extract/);
  assert.match(route, /archiveScoreboard/);
  assert.match(scoreboard, /\/archive\/scoreboards/);
  assert.doesNotMatch(scoreboard, /new Map/);
  assert.match(backendScoreboard, /run\.json/);
  assert.match(backendScoreboard, /freezeAtSeconds/);
  assert.match(backendScoreboard, /pendingAttempts/);
  assert.match(backendScoreboard, /archive-scoreboard-source/);
  assert.match(backendScoreboard, /archive-scoreboard-view/);
  assert.match(backendScoreboard, /persistent: "sqlite"/);
  const response = await render("/vp/archive");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /历届补题/);
  assert.match(html, /ICPC 武汉全国邀请赛/);
  assert.match(html, /省赛/);

  const problemResponse = await render("/vp/archive/problem?contest=2026-shenzhen-invitational&slot=A");
  assert.equal(problemResponse.status, 200);
  const problemHtml = await problemResponse.text();
  assert.match(problemHtml, /Greetings from Prof\. Chen/);
  assert.match(problemHtml, /提交代码/);
});

test("integrates the 2024 Xi'an Invitational as local bilingual statements", async () => {
  const [catalog, manifestText, statementA, statementJ, problemPage, statementClient, importer] = await Promise.all([
    readFile(new URL("app/data/archive-contests.ts", root), "utf8"),
    readFile(new URL("public/archive-statements/2024-xian-invitational/manifest.json", root), "utf8"),
    readFile(new URL("public/archive-statements/2024-xian-invitational/A.json", root), "utf8"),
    readFile(new URL("public/archive-statements/2024-xian-invitational/J.json", root), "utf8"),
    readFile(new URL("app/vp/archive/problem/page.tsx", root), "utf8"),
    readFile(new URL("app/lib/archive-statement-client.ts", root), "utf8"),
    readFile(new URL("scripts/import_xian_luogu_statements.py", root), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const problemA = JSON.parse(statementA);
  const problemJ = JSON.parse(statementJ);
  assert.equal(manifest.problems.length, 13);
  assert.equal(manifest.luoguContestId, 173404);
  assert.match(catalog, /luoguProblemIds: \["P10553", "P10554"/);
  assert.equal(problemA.titleZh, "猜树");
  assert.equal(problemA.english.sections.length > 0, true);
  assert.equal(problemA.chinese.sections.length > 0, true);
  assert.equal(problemJ.images[0].src, "/archive-statements/2024-xian-invitational/assets/J-1.png");
  assert.equal(problemJ.samples.length, 3);
  assert.match(problemPage, /katex\.renderToString/);
  assert.match(problemPage, /statement\.samples/);
  assert.match(problemPage, /problem\.judge === "luogu"/);
  assert.match(statementClient, /mirror-structured/);
  assert.match(importer, /lentille-context/);
});

test("ships the 2025 Shenyang regional as instant official bilingual statements", async () => {
  const slots = "ABCDEFGHIJKLM".split("");
  const [catalog, archivePage, manifestText, importer, ...statementTexts] = await Promise.all([
    readFile(new URL("app/data/archive-contests.ts", root), "utf8"),
    readFile(new URL("app/vp/archive/page.tsx", root), "utf8"),
    readFile(new URL("public/archive-statements/2025-shenyang/manifest.json", root), "utf8"),
    readFile(new URL("scripts/import_shenyang_statements.py", root), "utf8"),
    ...slots.map((slot) => readFile(new URL(`public/archive-statements/2025-shenyang/${slot}.json`, root), "utf8")),
  ]);
  const manifest = JSON.parse(manifestText);
  const statements = statementTexts.map((text) => JSON.parse(text));
  assert.equal(manifest.problems.length, 13);
  assert.equal(manifest.officialChinese, true);
  assert.match(catalog, /id: "2025-shenyang"[\s\S]*staticStatements: "official-chinese"/);
  assert.match(catalog, /"Square Kingdom", "Buggy Painting Software I"/);
  assert.match(archivePage, /contest\?\.staticStatements/);
  assert.match(importer, /ver=zh_cn/);
  assert.match(importer, /official-pdf-extract/);
  assert.equal(statements.every((problem) => problem.english.sections.length > 0), true);
  assert.equal(statements.every((problem) => problem.chinese.sections.length > 0), true);
  assert.equal(statements.every((problem) => problem.source.chinesePdfUrl.includes("ver=zh_cn")), true);
  assert.equal(statements.some((problem) => problem.images.length > 0), true);
  assert.equal(statements.flatMap((problem) => problem.images).every((image) => image.src.startsWith("/archive-statements/2025-shenyang/assets/")), true);
  assert.equal(statements.some((problem) => problem.samples.length > 1), true);
  assert.match(statementTexts[0], /\\\\frac\{n\(n-1\)\}\{2\}/);
  assert.match(statementTexts[6], /\\\\int_D/);
  assert.match(statementTexts[11], /\\\\left\\\\lceil\\\\frac\{10\^7\}\{n\}/);
  assert.doesNotMatch(statementTexts.join("\n"), /\(cid:|\u0001|RRR/);

  const response = await render("/vp/archive/problem?contest=2025-shenyang&slot=A");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Square Kingdom/);
  assert.match(html, /提交代码/);
});

test("ships the 2026 Wuhan Invitational as proofread official bilingual statements", async () => {
  const slots = "ABCDEFGHIJKLM".split("");
  const [catalog, manifestText, ...statementTexts] = await Promise.all([
    readFile(new URL("app/data/archive-contests.ts", root), "utf8"),
    readFile(new URL("public/archive-statements/2026-wuhan-invitational/manifest.json", root), "utf8"),
    ...slots.map((slot) => readFile(new URL(`public/archive-statements/2026-wuhan-invitational/${slot}.json`, root), "utf8")),
  ]);
  const manifest = JSON.parse(manifestText);
  const statements = statementTexts.map((text) => JSON.parse(text));
  const statementText = (problem, language) => problem[language].sections.flatMap((section) => section.blocks.flatMap((block) => block.kind === "bullets" ? block.items : [block.text])).join("\n");

  assert.equal(manifest.problems.length, 13);
  assert.equal(manifest.officialChinese, true);
  assert.match(catalog, /id: "2026-wuhan-invitational"[\s\S]*staticStatements: "official-chinese"/);
  assert.match(catalog, /"Sort", "Sequence Operations", "Believe in You"/);
  assert.equal(statements.every((problem) => problem.timeLimitText && problem.memoryLimitText), true);
  assert.equal(statements.every((problem) => problem.source.englishPdfUrl.includes("type=statement")), true);
  assert.equal(statements.every((problem) => problem.source.chinesePdfUrl.endsWith("type=attachments&id=3799&r=1")), true);
  assert.equal(statements.every((problem) => problem.english.sections.length > 0 && problem.chinese.sections.length > 0), true);
  assert.equal(statements.every((problem) => new Set(problem.english.sections.map((section) => section.key)).size === problem.english.sections.length), true);
  assert.equal(statements.every((problem) => new Set(problem.chinese.sections.map((section) => section.key)).size === problem.chinese.sections.length), true);

  assert.doesNotMatch(statementText(statements[0], "chinese"), /，表示给定的排列|一个1∼n\s*第二行/);
  assert.match(statementText(statements[0], "chinese"), /\$p_1,p_2,\\ldots,p_n\$/);
  assert.match(statementText(statements[3], "english"), /\$n\\leftarrow n\/p\$/);
  assert.match(statementText(statements[3], "chinese"), /10\^\{18\}/);
  assert.match(statementText(statements[7], "chinese"), /图 1：样例解释/);
  assert.equal(statements[7].images[0].src, "/archive-statements/2026-wuhan-invitational/assets/H-1.png");
  assert.equal(statements[7].images[0].captionZh, "样例切割后的矩形");
  assert.match(statementText(statements[9], "english"), /\$10\^\{1000\}\$/);
  assert.match(statementText(statements[9], "english"), /\\sum v_i/);
  assert.match(statementText(statements[11], "chinese"), /\\sum_\{1\\le i<j\\le n\} f\(t_\{i,j\}\)/);
  assert.match(statementText(statements[11], "chinese"), /\\sum_\{i=1\}\^\{n\}\|s_i\|/);
  assert.doesNotMatch(statementText(statements[12], "chinese"), /\n。\n|保证数据.*每种数字各出现两次/);
  assert.match(statementText(statements[12], "chinese"), /数据恰好有 \$50\$ 组/);

  for (const problem of statements) {
    for (const language of ["english", "chinese"]) {
      const text = statementText(problem, language);
      assert.equal((text.match(/\$/g) || []).length % 2, 0, `${problem.slot} ${language} has unbalanced math delimiters`);
      for (const match of text.matchAll(/\$([^$]+)\$/g)) {
        assert.doesNotThrow(() => katex.renderToString(match[1], { throwOnError: true }), `${problem.slot} ${language}: ${match[1]}`);
      }
    }
  }

  const response = await render("/vp/archive/problem?contest=2026-wuhan-invitational&slot=A");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Sort/);
  assert.match(html, /提交代码/);
});

test("ships the 2024 Shenyang regional as instant official bilingual statements", async () => {
  const slots = "ABCDEFGHIJKLM".split("");
  const [catalog, manifestText, importer, ...statementTexts] = await Promise.all([
    readFile(new URL("app/data/archive-contests.ts", root), "utf8"),
    readFile(new URL("public/archive-statements/2024-shenyang/manifest.json", root), "utf8"),
    readFile(new URL("scripts/import_shenyang_statements.py", root), "utf8"),
    ...slots.map((slot) => readFile(new URL(`public/archive-statements/2024-shenyang/${slot}.json`, root), "utf8")),
  ]);
  const manifest = JSON.parse(manifestText);
  const statements = statementTexts.map((text) => JSON.parse(text));
  assert.equal(manifest.problems.length, 13);
  assert.equal(manifest.officialChinese, true);
  assert.match(catalog, /id: "2024-shenyang"[\s\S]*qojContestId: 1865[\s\S]*staticStatements: "official-chinese"/);
  assert.match(importer, /CONTEST_2024_PROBLEMS/);
  assert.equal(statements.every((problem) => problem.english.sections.length > 0), true);
  assert.equal(statements.every((problem) => problem.chinese.sections.length > 0), true);
  assert.equal(statements.every((problem) => problem.source.chinesePdfUrl.includes("ver=zh_cn")), true);
  assert.equal(statements.flatMap((problem) => problem.images).every((image) => image.src.startsWith("/archive-statements/2024-shenyang/assets/")), true);
  assert.match(statementTexts[0], /Not stable 表示“?不稳定/);
  assert.match(statementTexts[11], /Removed intervals 表示“?已删除区间/);
  assert.doesNotMatch(statementTexts.join("\n"), /\(cid:|\u0001|RRR/);

  const response = await render("/vp/archive/problem?contest=2024-shenyang&slot=A");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Safety First/);
  assert.match(html, /提交代码/);
});

test("ships the domestic API, SQLite persistence, cached statements, OCR, and local translation deployment", async () => {
  const [backend, persistence, persistentClient, statements, archiveClient, archiveCatalog, archiveHtmlParser, compose, dockerfile, nginx, browserApi, worker, updater] = await Promise.all([
    readFile(new URL("backend/server.mjs", root), "utf8"),
    readFile(new URL("backend/persistence.mjs", root), "utf8"),
    readFile(new URL("app/lib/persistent-state.ts", root), "utf8"),
    readFile(new URL("backend/statements.mjs", root), "utf8"),
    readFile(new URL("app/lib/archive-statement-client.ts", root), "utf8"),
    readFile(new URL("app/data/archive-contests.ts", root), "utf8"),
    readFile(new URL("backend/archive-html-parser.mjs", root), "utf8"),
    readFile(new URL("backend/compose.yaml", root), "utf8"),
    readFile(new URL("backend/Dockerfile", root), "utf8"),
    readFile(new URL("deploy/nginx-icpc-trainer.conf", root), "utf8"),
    readFile(new URL("app/lib/browser-api.ts", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("deploy/update-backend.sh", root), "utf8"),
  ]);
  assert.match(backend, /\/vp\/generate/);
  assert.match(backend, /\/submissions\/raw/);
  assert.match(backend, /Access-Control-Allow-Origin/);
  assert.match(backend, /\/codeforces\/problems/);
  assert.match(backend, /\/codeforces\/recommendations/);
  assert.match(backend, /\/vp\/standings/);
  assert.match(backend, /pickThinkingSet/);
  assert.match(backend, /thinkingCount/);
  assert.match(backend, /pendingAttempts/);
  assert.match(backend, /contest\.standings/);
  assert.match(backend, /buildOriginalVpRows/);
  assert.match(backend, /CF_STANDINGS_CACHE_DIR/);
  assert.doesNotMatch(backend, /const submissionCache = new Map/);
  assert.doesNotMatch(backend, /const contestStandingsCache = new Map/);
  assert.match(backend, /writeRuntimeCache\("contest-standings"/);
  assert.match(backend, /persistVpSession/);
  assert.match(backend, /writeVpSnapshot/);
  assert.match(backend, /\/vp\/sessions\/active/);
  assert.match(backend, /\/state/);
  assert.match(persistence, /CREATE TABLE IF NOT EXISTS runtime_cache/);
  assert.match(persistence, /CREATE TABLE IF NOT EXISTS personal_state/);
  assert.match(persistence, /CREATE TABLE IF NOT EXISTS platform_submissions/);
  assert.match(persistence, /CREATE TABLE IF NOT EXISTS vp_sessions/);
  assert.match(persistence, /CREATE TABLE IF NOT EXISTS vp_standing_snapshots/);
  assert.match(persistence, /gzipSync/);
  assert.match(persistentClient, /loadPersistentJson/);
  assert.match(persistentClient, /authFetch/);
  assert.match(backend, /selectedProblems/);
  assert.match(backend, /\/platform-submissions/);
  assert.match(backend, /createStatementHandler/);
  assert.match(statements, /problem_statements/);
  assert.match(statements, /statement_assets/);
  assert.match(statements, /archive_statements/);
  assert.match(statements, /archive_statement_prewarm/);
  assert.match(statements, /\/archive\/statements\/prewarm/);
  assert.match(statements, /ARCHIVE_PREWARM_CONCURRENCY = 3/);
  assert.match(statements, /archive_statement_assets/);
  assert.match(statements, /chinese_source_url/);
  assert.match(statements, /ver=zh_cn/);
  assert.match(statements, /importArchiveOfficialChinese/);
  assert.match(statements, /pdftotext/);
  assert.match(statements, /pdfimages/);
  assert.match(statements, /tesseract/);
  assert.match(statements, /TRANSLATOR_MODEL/);
  assert.match(statements, /stale-while-revalidate/);
  assert.match(statements, /translateBatch/);
  assert.match(statements, /translateReviewedTexts/);
  assert.match(statements, /extractArchiveGymStatement/);
  assert.match(statements, /ARCHIVE_TRANSLATION_VERSION = 2/);
  assert.match(statements, /TRANSLATION_VERSION = 22/);
  assert.match(statements, /edge\.microsoft\.com\/translate\/auth/);
  assert.match(statements, /json_schema/);
  assert.match(statements, /processedBlocks/);
  assert.match(archiveClient, /gymId/);
  assert.match(archiveCatalog, /id: "2025-chengdu"[\s\S]*gymId: 106161[\s\S]*A Lot of Paintings/);
  assert.match(archiveHtmlParser, /parseArchiveStatementHtml/);
  assert.match(compose, /127\.0\.0\.1:8787:8787/);
  assert.match(compose, /ggml-org\/llama\.cpp:server/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(dockerfile, /tesseract-ocr/);
  assert.match(dockerfile, /poppler-utils/);
  assert.match(nginx, /\/icpc-api\//);
  assert.match(nginx, /114\.55\.130\.137/);
  assert.match(browserApi, /https:\/\/114\.55\.130\.137\/icpc-api/);
  assert.match(worker, /X-Frame-Options/);
  assert.match(worker, /Permissions-Policy/);
  assert.match(updater, /backend-before-/);
  assert.match(updater, /platform-submissions/);
});

test("ships invite-only authentication and administration", async () => {
  const [auth, compose, login, register, admin] = await Promise.all([
    readFile(new URL("backend/auth.mjs", root), "utf8"),
    readFile(new URL("backend/compose.yaml", root), "utf8"),
    readFile(new URL("app/login/page.tsx", root), "utf8"),
    readFile(new URL("app/register/page.tsx", root), "utf8"),
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
  ]);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS invites/);
  assert.match(auth, /scryptSync/);
  assert.match(auth, /\/auth\/register/);
  assert.match(auth, /\/admin\/invites/);
  assert.match(compose, /icpc-trainer-data:\/data/);
  assert.match(login, /继续你的训练/);
  assert.match(register, /inviteCode/);
  assert.match(register, /需要管理员邀请码/);
  assert.match(auth, /used_count >= invite\.max_uses/);
  assert.match(auth, /used_count = used_count \+ 1/);
  assert.match(auth, /min: 1, max: 100/);
  assert.match(admin, /生成邀请码/);
  assert.match(admin, /可注册人数/);
  assert.match(admin, /invite-presets/);
  assert.match(admin, /撤销/);
  assert.match(admin, /反馈处理状态/);
});

test("uses one validated training profile across dashboard, catalog, submissions, and VP", async () => {
  const [preferences, home, catalog, submissions, vp] = await Promise.all([
    readFile(new URL("app/lib/preferences.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/problem/page.tsx", root), "utf8"),
    readFile(new URL("app/submissions/page.tsx", root), "utf8"),
    readFile(new URL("app/vp/page.tsx", root), "utf8"),
  ]);
  assert.match(preferences, /validCodeforcesHandle/);
  assert.match(preferences, /dailyGoal/);
  for (const source of [home, catalog, submissions, vp]) assert.match(source, /readTrainerPreferences/);
});

test("keeps platform submissions, source code, final verdicts, and problem history inside the product", async () => {
  const [client, shell, problem, archiveProblem, list, detail, backend, persistence] = await Promise.all([
    readFile(new URL("app/lib/platform-submissions.ts", root), "utf8"),
    readFile(new URL("app/components/AppShell.tsx", root), "utf8"),
    readFile(new URL("app/problem/[code]/page.tsx", root), "utf8"),
    readFile(new URL("app/vp/archive/problem/page.tsx", root), "utf8"),
    readFile(new URL("app/submissions/page.tsx", root), "utf8"),
    readFile(new URL("app/submissions/[requestId]/page.tsx", root), "utf8"),
    readFile(new URL("backend/server.mjs", root), "utf8"),
    readFile(new URL("backend/persistence.mjs", root), "utf8"),
  ]);
  assert.match(client, /\/platform-submissions/);
  assert.match(client, /sourceCode/);
  assert.match(client, /queueRemote/);
  assert.match(shell, /judgeSubmissionId/);
  assert.match(shell, /applyArchiveJudgeVerdict/);
  assert.match(problem, /本题提交记录/);
  assert.match(problem, /选择文件/);
  assert.match(problem, /submitLanguage/);
  assert.match(archiveProblem, /sourceCode/);
  assert.match(list, /\/submissions\/\$\{row\.requestId\}/);
  assert.match(detail, /复制代码/);
  assert.match(detail, /评测站提交编号/);
  assert.match(backend, /platform-submissions\/status/);
  assert.match(persistence, /source_payload/);
  assert.match(persistence, /updatePlatformSubmissionStatus/);
});

test("ships a deliberate-practice loop and collects user experience feedback", async () => {
  const [home, catalog, detail, shell, auth, admin] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/problem/page.tsx", root), "utf8"),
    readFile(new URL("app/problem/[code]/page.tsx", root), "utf8"),
    readFile(new URL("app/components/AppShell.tsx", root), "utf8"),
    readFile(new URL("backend/auth.mjs", root), "utf8"),
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
  ]);
  assert.match(catalog, /弱项攻坚/);
  assert.match(home, /历届补题/);
  assert.match(home, /思维题推荐/);
  assert.match(home, /thinkingTags/);
  assert.doesNotMatch(home, /concealMeta/);
  assert.match(detail, /或直接粘贴代码/);
  assert.match(catalog, /赛场思维模式/);
  assert.match(catalog, /Boss 题/);
  assert.match(detail, /THINKING MODE/);
  assert.match(detail, /独立完成/);
  assert.match(detail, /题解后完成/);
  assert.match(shell, /体验建议/);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS training_events/);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS feedback/);
  assert.match(admin, /反馈处理状态/);
});
