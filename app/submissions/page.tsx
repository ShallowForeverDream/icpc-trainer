"use client";
import { AppShell, Pill } from "../components/AppShell";

const rows = [
  ["#261904331", "CF 1970D1", "Reverse Card", "Accepted", "GNU C++20", "46 ms", "14:32"],
  ["#261899087", "CF 1920C", "Partitioning the Array", "Wrong answer", "GNU C++20", "62 ms", "13:48"],
  ["#261898711", "CF 1920C", "Partitioning the Array", "Accepted", "GNU C++20", "62 ms", "13:42"],
  ["#261872440", "GYM 104901F", "Lottery", "Time limit", "GNU C++20", "2000 ms", "昨天"],
];

export default function SubmissionsPage(){return <AppShell active="提交记录"><section className="library-hero"><div><span className="eyebrow"><span className="live-dot"/> CODEFORCES SYNCED</span><h1>提交记录</h1><p>来自平台和已绑定 Codeforces 账号的历史提交会汇总在这里。</p></div><button className="button button-primary">↻ 立即同步</button></section><div className="library-toolbar"><div className="template-search"><input placeholder="按题号或题名搜索…"/></div><div className="category-tabs"><button className="active">全部</button><button>Accepted</button><button>未通过</button></div></div><section className="submission-table"><div className="submission-table-head"><span>提交 ID</span><span>题目</span><span>状态</span><span>语言</span><span>耗时</span><span>时间</span></div>{rows.map(r=><a href="/problem" className="submission-table-row" key={r[0]}><span>{r[0]}</span><span><b>{r[1]}</b><small>{r[2]}</small></span><span><Pill>{r[3]}</Pill></span><span>{r[4]}</span><span>{r[5]}</span><span>{r[6]}</span></a>)}</section></AppShell>}
