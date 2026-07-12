"use client";

import { useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";

export default function VpPage() {
  const [mode, setMode] = useState("随机组卷");
  const [duration, setDuration] = useState("3 小时");
  const [count, setCount] = useState(10);
  const [created, setCreated] = useState(false);
  return <AppShell active="模拟赛">
    <section className="vp-hero"><div><span className="eyebrow"><span className="live-dot" /> VIRTUAL PARTICIPATION</span><h1>模拟一场真正的比赛。</h1><p>从未做过的 Codeforces 与公开 Gym 题目中组卷，平台负责计时、封榜与 ICPC 罚时。</p></div><div className="vp-rules"><span><b>−20</b>错误罚时</span><span><b>1h</b>最后封榜</span><span><b>0</b>已做题</span></div></section>
    <section className="vp-builder">
      <div className="builder-main">
        <div className="section-number"><span>01</span><div><h2>选择比赛模式</h2><p>随机组卷适合能力训练，原场镜像更接近历史比赛体验。</p></div></div>
        <div className="mode-grid">{[["随机组卷","从多个比赛中智能选题","✦"],["原场镜像","完整复刻一场历史比赛","◫"]].map(([name,desc,icon]) => <button key={name} className={mode===name?"active":""} onClick={() => setMode(name)}><b>{icon}</b><span><strong>{name}</strong><small>{desc}</small></span><i>{mode===name?"●":"○"}</i></button>)}</div>
        <div className="section-number"><span>02</span><div><h2>比赛规模</h2><p>为这场训练设置时长与题目数量。</p></div></div>
        <div className="setting-row"><label>比赛时长</label><div className="segmented">{["2 小时","3 小时","5 小时"].map(x=><button key={x} className={duration===x?"active":""} onClick={()=>setDuration(x)}>{x}</button>)}</div></div>
        <div className="setting-row"><label>题目数量</label><div className="counter"><button onClick={()=>setCount(Math.max(8,count-1))}>−</button><strong>{count}</strong><button onClick={()=>setCount(Math.min(13,count+1))}>＋</button><span>8–13 道</span></div></div>
        <div className="section-number"><span>03</span><div><h2>训练目标</h2><p>系统会围绕目标水平生成由易到难的梯度。</p></div></div>
        <div className="form-grid"><label>目标 Rating<select><option>1600（当前 +0）</option><option>1800（当前 +200）</option><option>2000（当前 +400）</option></select></label><label>思维题比例<select><option>标准 · 30%</option><option>思维强化 · 50%</option><option>高思维 · 70%</option></select></label><label>题目来源<select><option>Codeforces + 公开 Gym</option><option>仅 Codeforces</option><option>仅公开 Gym</option></select></label><label>参赛方式<select><option>个人 VP</option><option>三人临时队</option></select></label></div>
        <div className="toggle-list"><label><span><b>允许暂停</b><small>最多 3 次，累计不超过 10 分钟</small></span><input type="checkbox" defaultChecked /></label><label><span><b>包含交互题</b><small>每场最多一题，默认关闭</small></span><input type="checkbox" /></label></div>
      </div>
      <aside className="builder-summary">
        <span className="micro-label">CONTEST PREVIEW</span><h2>{mode}</h2><div className="summary-time"><b>{duration.slice(0,1)}</b><span>小时</span><i>·</i><b>{count}</b><span>题</span></div>
        <div className="difficulty-curve">{[25,42,56,69,78,88,96,81,62,45].slice(0,Math.min(10,count)).map((h,i)=><i key={i} style={{height:`${h}%`}}><span>{String.fromCharCode(65+i)}</span></i>)}</div>
        <div className="summary-list"><p><Icon name="check" /> 已排除你的 486 道历史题目</p><p><Icon name="check" /> 比赛中隐藏 Rating、标签与来源</p><p><Icon name="check" /> 最后一小时自动封榜</p><p><Icon name="check" /> 保存随机种子，可完整复现</p></div>
        <div className="assurance"><Pill>STRICT VP</Pill><span>题池同步完成 · 7 分钟前</span></div>
        <button className="create-contest" onClick={()=>setCreated(true)}>{created ? "已生成，准备进入大厅 →" : "生成比赛 →"}</button>
        <small className="summary-foot">生成前仍可修改条件。题目展示后不可重新组卷。</small>
      </aside>
    </section>
  </AppShell>;
}
