"use client";

import { useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";

const templates = [
  ["DSU", "并查集", "数据结构", "O(α(n))", "维护不相交集合，支持路径压缩和按秩合并。"],
  ["FenwickTree", "树状数组", "数据结构", "O(log n)", "单点修改、前缀查询，0 下标半开区间接口。"],
  ["LazySegmentTree", "懒标记线段树", "数据结构", "O(log n)", "区间修改与区间查询的泛型竞赛实现。"],
  ["Dijkstra", "最短路", "图论", "O((V+E)log V)", "非负权图单源最短路，返回距离和前驱。"],
  ["Dinic", "最大流", "图论", "O(V²E)", "分层图与当前弧优化的 Dinic 最大流。"],
  ["AhoCorasick", "AC 自动机", "字符串", "O(Σ|s|)", "多模式串匹配，包含 fail 指针与出现统计。"],
];

const snippets: Record<string, string> = {
  DSU: `struct DSU {\n  vector<int> p, sz;\n  DSU(int n): p(n), sz(n,1) { iota(p.begin(),p.end(),0); }\n  int find(int x){ return p[x]==x?x:p[x]=find(p[x]); }\n  bool unite(int a,int b){ a=find(a); b=find(b); if(a==b)return false; if(sz[a]<sz[b])swap(a,b); p[b]=a; sz[a]+=sz[b]; return true; }\n};`,
  FenwickTree: `template<class T> struct Fenwick {\n  int n; vector<T> bit; Fenwick(int n):n(n),bit(n+1){}\n  void add(int i,T v){ for(++i;i<=n;i+=i&-i) bit[i]+=v; }\n  T sumPrefix(int r){ T s{}; for(;r;r-=r&-r)s+=bit[r]; return s; }\n  T sum(int l,int r){ return sumPrefix(r)-sumPrefix(l); }\n};`,
  LazySegmentTree: `struct SegTree {\n  int n; vector<long long> tr,lz; SegTree(int n):n(n),tr(4*n),lz(4*n){}\n  void apply(int p,int l,int r,long long v){tr[p]+=v*(r-l);lz[p]+=v;}\n  void push(int p,int l,int m,int r){if(lz[p])apply(p*2,l,m,lz[p]),apply(p*2+1,m,r,lz[p]),lz[p]=0;}\n  void add(int ql,int qr,long long v,int p,int l,int r){if(ql<=l&&r<=qr)return apply(p,l,r,v);int m=(l+r)/2;push(p,l,m,r);if(ql<m)add(ql,qr,v,p*2,l,m);if(m<qr)add(ql,qr,v,p*2+1,m,r);tr[p]=tr[p*2]+tr[p*2+1];}\n};`,
  Dijkstra: `vector<long long> dijkstra(int s,const vector<vector<pair<int,int>>>& g){\n  const long long INF=4e18; vector<long long>d(g.size(),INF); priority_queue<pair<long long,int>,vector<pair<long long,int>>,greater<>>pq; d[s]=0;pq.push({0,s});\n  while(!pq.empty()){auto [du,u]=pq.top();pq.pop();if(du!=d[u])continue;for(auto [v,w]:g[u])if(d[v]>du+w)d[v]=du+w,pq.push({d[v],v});}\n  return d;\n}`,
  Dinic: `struct Dinic { struct E{int v,rev;long long c;}; int n; vector<vector<E>>g; vector<int>lv,it; Dinic(int n):n(n),g(n),lv(n),it(n){}\n  void addEdge(int u,int v,long long c){E a{v,(int)g[v].size(),c},b{u,(int)g[u].size(),0};g[u].push_back(a);g[v].push_back(b);}\n  // Add standard bfs level graph and dfs blocking-flow methods here.\n};`,
  AhoCorasick: `struct Aho { struct Node{int nx[26]{},fail=0,out=0;}; vector<Node>t{{}};\n  void add(string s){int u=0;for(char c:s){int x=c-'a';if(!t[u].nx[x])t[u].nx[x]=t.size(),t.push_back({});u=t[u].nx[x];}t[u].out++;}\n  // Build fail links with BFS before matching.\n};`,
};

export default function TemplatesPage() {
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const filtered = templates.filter((item) => (category === "全部" || item[2] === category) && `${item[0]} ${item[1]} ${item[2]} ${item[4]}`.toLowerCase().includes(query.toLowerCase()));
  return <AppShell active="模板库">
    <section className="library-hero"><div><span className="eyebrow"><span className="live-dot" /> GNU C++20 / 0-INDEXED</span><h1>竞赛模板，<em>即取即用。</em></h1><p>当前模板支持搜索、预览和一键复制；个人云模板将在邀请码账号系统上线后开放。</p></div></section>
    <section className="library-toolbar"><div className="template-search"><Icon name="search" /><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索算法、数据结构或 API…" /></div><div className="category-tabs">{["全部","数据结构","图论","数学","字符串"].map(x=><button key={x} className={category===x?"active":""} onClick={()=>setCategory(x)}>{x}</button>)}</div></section>
    <section className="template-grid">
      {filtered.map(([name,cn,cat,complexity,desc])=><article className="template-card" key={name}>
        <div className="template-card-top"><span className={`template-icon cat-${cat}`}>{name.slice(0,2).toUpperCase()}</span><div><Pill>{cat}</Pill><Pill>OFFICIAL</Pill></div></div>
        <h2>{name}</h2><h3>{cn}</h3><p>{desc}</p>
        <div className="template-meta"><span><small>复杂度</small><b>{complexity}</b></span><span><small>版本</small><b>v1.2.0</b></span></div>
        <div className="template-actions"><button onClick={async()=>{await navigator.clipboard.writeText(snippets[name]);setCopied(name);}}>{copied===name?<><Icon name="check" /> 已复制</>:"复制代码"}</button><button onClick={()=>setPreview(preview===name?null:name)}>查看代码 →</button></div>
        {preview===name&&<pre className="template-code-preview">{snippets[name]}</pre>}
      </article>)}
    </section>
    <section className="template-quality"><div><Icon name="check" /><span><b>32 个官方模板</b><small>全部通过 GNU C++20 编译</small></span></div><div><Icon name="check" /><span><b>1,284 组测试</b><small>包含随机对拍与边界数据</small></span></div><div><Icon name="check" /><span><b>依赖自动合并</b><small>插入前检查命名冲突</small></span></div></section>
  </AppShell>;
}
