"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, Icon, MetricCard, Pill, ProblemRow } from "./components/AppShell";

const recommendations = [
  [
    { code: "CF 1967B1", title: "Reverse Card (Easy Version)", titleZh: "反转卡牌（简单版）", rating: 1400, tags: ["数论", "观察"], status: "未尝试" },
    { code: "CF 1920C", title: "Partitioning the Array", titleZh: "划分数组", rating: 1600, tags: ["数学", "枚举"], status: "未尝试" },
    { code: "CF 1904C", title: "Array Game", titleZh: "数组游戏", rating: 1400, tags: ["贪心", "思维"], status: "未尝试" },
  ],
  [
    { code: "CF 1367C", title: "Social Distance", titleZh: "社交距离", rating: 1300, tags: ["贪心", "字符串"], status: "未尝试" },
    { code: "CF 1791F", title: "Range Update Point Query", titleZh: "区间更新与单点查询", rating: 1600, tags: ["数据结构", "并查集"], status: "未尝试" },
    { code: "CF 706B", title: "Interesting drink", titleZh: "有趣的饮料", rating: 1100, tags: ["二分", "排序"], status: "未尝试" },
  ],
];

export default function Home() {
  const [batch, setBatch] = useState(0);
  const [goal, setGoal] = useState(4);
  const [done, setDone] = useState(0);
  const [activity, setActivity] = useState<Record<string, number>>({});
  const problems = useMemo(() => recommendations[batch % recommendations.length], [batch]);
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = dateKey(new Date());
  const days = useMemo(() => Array.from({ length: 91 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - 90 + index); return dateKey(date); }), []);
  const totalActivity = Object.values(activity).reduce((sum, value) => sum + value, 0);
  const weeklyActivity = days.slice(-7).reduce((sum, key) => sum + (activity[key] ?? 0), 0);
  let streak = 0; for (let index = days.length - 1; index >= 0 && (activity[days[index]] ?? 0) > 0; index--) streak++;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("icpc-trainer-dashboard") ?? "{}");
      if (saved.goal) setGoal(saved.goal); if (saved.date === today && saved.done) setDone(saved.done); if (saved.activity) setActivity(saved.activity);
    } catch { localStorage.removeItem("icpc-trainer-dashboard"); }
  }, []);

  function saveDashboard(nextGoal: number, nextDone: number, nextActivity = activity) {
    setGoal(nextGoal); setDone(nextDone); setActivity(nextActivity);
    localStorage.setItem("icpc-trainer-dashboard", JSON.stringify({ date: today, goal: nextGoal, done: nextDone, activity: nextActivity }));
  }

  function recordProblem() {
    if (done >= goal) return;
    const key = dateKey(new Date());
    saveDashboard(goal, done + 1, { ...activity, [key]: (activity[key] ?? 0) + 1 });
  }

  return (
    <AppShell active="训练台">
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> TRAINING / 2026.07.12</div>
          <h1>把训练闭环，<br /><em>真正跑起来。</em></h1>
          <p>首批 20 道中文精选题已经就绪。现在可以校准 Codeforces 官方题库、同步公开提交，并用浏览器扩展预填提交。</p>
          <div className="hero-actions">
            <a className="button button-primary" href="/problem"><Icon name="play" /> 开始今日训练</a>
            <a className="button button-ghost" href="/vp">创建一场 VP <span>↗</span></a>
          </div>
        </div>
        <div className="focus-card">
          <div className="focus-top">
            <div>
              <span className="micro-label">TODAY&apos;S FOCUS</span>
              <h2>每日目标</h2>
            </div>
            <span className="ring-stat">{done}/{goal}</span>
          </div>
          <div className="goal-track"><i style={{ width: `${Math.min(100, done / goal * 100)}%` }} /></div>
          <div className="goal-controls">
            <span>完成 {goal} 道题</span>
            <div>
              <button aria-label="减少目标" onClick={() => saveDashboard(Math.max(done, goal - 1), done)}>−</button>
              <button aria-label="增加目标" onClick={() => saveDashboard(goal + 1, done)}>＋</button>
              <button className="complete-goal" onClick={recordProblem}>记一题</button>
            </div>
          </div>
          <div className="streak-row">
            <div><Icon name="fire" /><span><b>{streak} 天</b><small>当前设备连续训练</small></span></div>
            <div><Icon name="clock" /><span><b>{weeklyActivity} 题</b><small>本周手动记录</small></span></div>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="中文精选题" value="20" delta="已导入" tone="blue" />
        <MetricCard label="CF 公开 API" value="LIVE" delta="无需 Key" tone="green" />
        <MetricCard label="提交扩展" value="β" delta="可下载" tone="amber" />
        <MetricCard label="账号系统" value="LIVE" delta="邀请码" tone="violet" />
      </section>

      <section className="content-grid">
        <div className="panel recommendations-panel">
          <div className="panel-head">
            <div>
              <span className="micro-label">CURATED FOR YOU</span>
              <h2>今日推荐</h2>
            </div>
            <button className="text-button" onClick={() => setBatch(batch + 1)}><Icon name="shuffle" /> 换一组</button>
          </div>
          <div className="problem-list">
            {problems.map((problem, index) => <ProblemRow key={problem.code} problem={problem} index={index + 1} />)}
          </div>
          <a className="panel-footer-link" href="/problem">进入完整题库 <span>→</span></a>
        </div>

        <div className="panel weak-panel">
          <div className="panel-head">
            <div>
              <span className="micro-label">SKILL MAP</span>
              <h2>能力切片</h2>
            </div>
            <Pill>近 30 天</Pill>
          </div>
          <div className="skill-list">
            {[
              ["贪心", 84, "+12", "#4169e1"],
              ["数学", 71, "+6", "#19a974"],
              ["动态规划", 58, "+2", "#f0a330"],
              ["图论", 39, "−8", "#f35f68"],
            ].map(([name, score, delta, color]) => (
              <div className="skill-row" key={name as string}>
                <div><b>{name}</b><span>{delta}</span></div>
                <div className="skill-track"><i style={{ width: `${score}%`, background: color }} /></div>
                <strong>{score}</strong>
              </div>
            ))}
          </div>
          <div className="weak-callout"><Icon name="spark" /><p><b>建议训练图论</b><br />从最短路和树上问题开始，预计 6 题后回到均衡区间。</p></div>
        </div>
      </section>

      <section className="lower-grid">
        <div className="panel calendar-panel">
          <div className="panel-head">
            <div><span className="micro-label">CONSISTENCY</span><h2>训练日历</h2></div>
            <span className="calendar-total">当前设备累计 <b>{totalActivity}</b> 道</span>
          </div>
          <div className="heatmap" aria-label="训练活跃热力图">
            {days.map((key) => <i key={key} className={`heat-${Math.min(4, activity[key] ?? 0)}`} title={`${key}: ${activity[key] ?? 0} 道`} />)}
          </div>
          <div className="heat-legend"><span>少</span>{[0,1,2,3,4].map(i => <i key={i} className={`heat-${i}`} />)}<span>多</span></div>
        </div>
        <a className="vp-banner" href="/vp">
          <div className="vp-copy"><span className="micro-label">NEXT CONTEST</span><h2>来一场完整 VP？</h2><p>创建 3 小时 · 10 题的个人模拟赛，系统会排除你做过的题。</p></div>
          <div className="vp-time"><span>03</span><i>:</i><span>00</span><small>HOURS</small></div>
          <span className="circle-arrow">↗</span>
        </a>
      </section>
    </AppShell>
  );
}
