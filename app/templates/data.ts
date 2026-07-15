export type TemplateApi = { signature: string; description: string };

export type ContestTemplate = {
  slug: string;
  name: string;
  cn: string;
  shortCode: string;
  category: "数据结构" | "图论" | "字符串" | "数学";
  priority: "高频" | "常用" | "进阶";
  complexity: string;
  summary: string;
  bestFor: string[];
  apis: TemplateApi[];
  notes: string[];
  code: string;
};

export const templateCategories = ["全部", "数据结构", "图论", "字符串", "数学"] as const;

export const contestTemplates: ContestTemplate[] = [
  {
    slug: "dsu",
    name: "DSU",
    cn: "并查集",
    shortCode: "DS",
    category: "数据结构",
    priority: "高频",
    complexity: "均摊 O(α(n))",
    summary: "维护连通块，路径压缩与按大小合并，可直接处理动态连边。",
    bestFor: ["动态连通性", "Kruskal 最小生成树", "离线合并询问"],
    apis: [
      { signature: "find(x)", description: "返回 x 所在集合的根" },
      { signature: "unite(a, b)", description: "合并两个集合，成功时返回 true" },
      { signature: "size(x)", description: "返回 x 所在集合的大小" },
    ],
    notes: ["点编号使用 [0, n)", "unite 会优先把小集合接到大集合上"],
    code: `struct DSU {
    vector<int> parent, size_;

    explicit DSU(int n) : parent(n), size_(n, 1) {
        iota(parent.begin(), parent.end(), 0);
    }

    // 查找根节点，并在回溯时压缩路径。
    int find(int x) {
        return parent[x] == x ? x : parent[x] = find(parent[x]);
    }

    // 合并 a、b 所在集合；已经连通时返回 false。
    bool unite(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return false;
        if (size_[a] < size_[b]) swap(a, b);
        parent[b] = a;
        size_[a] += size_[b];
        return true;
    }

    bool same(int a, int b) {
        return find(a) == find(b);
    }

    int size(int x) {
        return size_[find(x)];
    }
};`,
  },
  {
    slug: "fenwick-tree",
    name: "FenwickTree",
    cn: "树状数组",
    shortCode: "FT",
    category: "数据结构",
    priority: "高频",
    complexity: "修改 / 查询 O(log n)",
    summary: "比线段树更短的前缀统计模板，统一使用 0 下标和半开区间。",
    bestFor: ["单点修改、区间求和", "逆序对", "离线计数"],
    apis: [
      { signature: "add(pos, delta)", description: "给 a[pos] 增加 delta" },
      { signature: "prefixSum(r)", description: "查询区间 [0, r) 的和" },
      { signature: "rangeSum(l, r)", description: "查询区间 [l, r) 的和" },
    ],
    notes: ["外部 0 下标，内部自动转为 1 下标", "T 通常取 long long"],
    code: `template<class T>
struct FenwickTree {
    int n;
    vector<T> bit;

    explicit FenwickTree(int n) : n(n), bit(n + 1, T{}) {}

    // 单点增加：a[pos] += delta。
    void add(int pos, T delta) {
        for (int x = pos + 1; x <= n; x += x & -x) {
            bit[x] += delta;
        }
    }

    // 返回 [0, r) 的区间和。
    T prefixSum(int r) const {
        T result{};
        for (int x = r; x > 0; x -= x & -x) {
            result += bit[x];
        }
        return result;
    }

    // 返回 [l, r) 的区间和。
    T rangeSum(int l, int r) const {
        return prefixSum(r) - prefixSum(l);
    }
};`,
  },
  {
    slug: "lazy-segment-tree",
    name: "LazySegmentTree",
    cn: "懒标记线段树",
    shortCode: "ST",
    category: "数据结构",
    priority: "高频",
    complexity: "修改 / 查询 O(log n)",
    summary: "区间加、区间和的稳定实现，接口采用 [l, r) 以减少边界错误。",
    bestFor: ["区间修改与查询", "扫描线维护区间", "需要懒标记下传的题目"],
    apis: [
      { signature: "rangeAdd(l, r, v)", description: "区间 [l, r) 全部增加 v" },
      { signature: "rangeSum(l, r)", description: "查询区间 [l, r) 的元素和" },
    ],
    notes: ["默认 n > 0", "sum 和 lazy 使用 long long"],
    code: `struct LazySegmentTree {
    using ll = long long;
    int n;
    vector<ll> sum, lazy;

    explicit LazySegmentTree(int n)
        : n(n), sum(4 * n), lazy(4 * n) {}

    // 给当前节点代表的整段增加 value。
    void apply(int p, int l, int r, ll value) {
        sum[p] += value * (r - l);
        lazy[p] += value;
    }

    // 将父节点尚未处理的标记下传给两个儿子。
    void push(int p, int l, int r) {
        if (lazy[p] == 0 || r - l == 1) return;
        int m = (l + r) / 2;
        apply(p * 2, l, m, lazy[p]);
        apply(p * 2 + 1, m, r, lazy[p]);
        lazy[p] = 0;
    }

    void rangeAdd(int ql, int qr, ll value, int p, int l, int r) {
        if (qr <= l || r <= ql) return;
        if (ql <= l && r <= qr) return apply(p, l, r, value);
        push(p, l, r);
        int m = (l + r) / 2;
        rangeAdd(ql, qr, value, p * 2, l, m);
        rangeAdd(ql, qr, value, p * 2 + 1, m, r);
        sum[p] = sum[p * 2] + sum[p * 2 + 1];
    }

    ll rangeSum(int ql, int qr, int p, int l, int r) {
        if (qr <= l || r <= ql) return 0;
        if (ql <= l && r <= qr) return sum[p];
        push(p, l, r);
        int m = (l + r) / 2;
        return rangeSum(ql, qr, p * 2, l, m)
             + rangeSum(ql, qr, p * 2 + 1, m, r);
    }

    void rangeAdd(int l, int r, ll value) {
        if (l < r) rangeAdd(l, r, value, 1, 0, n);
    }

    ll rangeSum(int l, int r) {
        return l < r ? rangeSum(l, r, 1, 0, n) : 0;
    }
};`,
  },
  {
    slug: "sparse-table",
    name: "SparseTable",
    cn: "静态区间最值",
    shortCode: "RM",
    category: "数据结构",
    priority: "常用",
    complexity: "预处理 O(n log n)，查询 O(1)",
    summary: "用于数组不修改时的区间最小值，代码短且查询常数很小。",
    bestFor: ["静态 RMQ", "区间最大值 / gcd", "LCP 等只读区间查询"],
    apis: [{ signature: "query(l, r)", description: "查询非空区间 [l, r) 的最小值" }],
    notes: ["当前版本实现 min", "运算必须满足幂等性"],
    code: `template<class T>
struct SparseTable {
    vector<int> log2_;
    vector<vector<T>> table;

    explicit SparseTable(const vector<T>& a) {
        int n = (int)a.size();
        log2_.resize(n + 1);
        for (int i = 2; i <= n; ++i) log2_[i] = log2_[i / 2] + 1;

        int levels = log2_[n] + 1;
        table.assign(levels, vector<T>(n));
        table[0] = a;
        for (int k = 1; k < levels; ++k) {
            for (int i = 0; i + (1 << k) <= n; ++i) {
                table[k][i] = min(table[k - 1][i],
                                  table[k - 1][i + (1 << (k - 1))]);
            }
        }
    }

    // 查询非空半开区间 [l, r) 的最小值。
    T query(int l, int r) const {
        int k = log2_[r - l];
        return min(table[k][l], table[k][r - (1 << k)]);
    }
};`,
  },
  {
    slug: "dijkstra",
    name: "Dijkstra",
    cn: "非负权最短路",
    shortCode: "DI",
    category: "图论",
    priority: "高频",
    complexity: "O((V + E) log V)",
    summary: "返回最短距离与前驱节点，既能判断可达性，也能恢复具体路径。",
    bestFor: ["非负边权单源最短路", "状态图最短路", "恢复最短路径"],
    apis: [{ signature: "dijkstra(source, graph)", description: "返回 {distance, parent}" }],
    notes: ["禁止存在负权边", "不可达点的距离保持 INF"],
    code: `using ll = long long;
const ll INF = numeric_limits<ll>::max() / 4;

struct Edge {
    int to;
    ll weight;
};

// graph[u] 中保存所有从 u 出发的边。
pair<vector<ll>, vector<int>> dijkstra(
    int source,
    const vector<vector<Edge>>& graph
) {
    int n = (int)graph.size();
    vector<ll> distance(n, INF);
    vector<int> parent(n, -1);
    priority_queue<pair<ll, int>,
                   vector<pair<ll, int>>,
                   greater<pair<ll, int>>> heap;

    distance[source] = 0;
    heap.push({0, source});

    while (!heap.empty()) {
        auto [dist_u, u] = heap.top();
        heap.pop();
        // 堆中可能残留旧距离，跳过即可。
        if (dist_u != distance[u]) continue;

        for (const auto& [v, weight] : graph[u]) {
            if (distance[v] > dist_u + weight) {
                distance[v] = dist_u + weight;
                parent[v] = u;
                heap.push({distance[v], v});
            }
        }
    }
    return {distance, parent};
}`,
  },
  {
    slug: "dinic",
    name: "Dinic",
    cn: "最大流",
    shortCode: "MF",
    category: "图论",
    priority: "常用",
    complexity: "一般图 O(V²E)",
    summary: "分层图配合当前弧优化，适合二分图匹配、割和容量模型。",
    bestFor: ["最大流 / 最小割", "二分图匹配", "容量限制建模"],
    apis: [
      { signature: "addEdge(u, v, cap)", description: "加入容量为 cap 的有向边" },
      { signature: "maxFlow(s, t)", description: "计算 s 到 t 的最大流" },
    ],
    notes: ["无向边需要双向分别加边", "容量类型使用 long long"],
    code: `struct Dinic {
    using ll = long long;
    static constexpr ll INF = numeric_limits<ll>::max() / 4;

    struct Edge {
        int to, reverse;
        ll capacity;
    };

    int n;
    vector<vector<Edge>> graph;
    vector<int> level, current;

    explicit Dinic(int n)
        : n(n), graph(n), level(n), current(n) {}

    void addEdge(int from, int to, ll capacity) {
        Edge forward{to, (int)graph[to].size(), capacity};
        Edge backward{from, (int)graph[from].size(), 0};
        graph[from].push_back(forward);
        graph[to].push_back(backward);
    }

    // BFS 建立只允许向下一层增广的分层图。
    bool buildLevelGraph(int source, int sink) {
        fill(level.begin(), level.end(), -1);
        queue<int> q;
        level[source] = 0;
        q.push(source);
        while (!q.empty()) {
            int u = q.front();
            q.pop();
            for (const Edge& edge : graph[u]) {
                if (edge.capacity > 0 && level[edge.to] == -1) {
                    level[edge.to] = level[u] + 1;
                    q.push(edge.to);
                }
            }
        }
        return level[sink] != -1;
    }

    ll sendFlow(int u, int sink, ll pushed) {
        if (u == sink || pushed == 0) return pushed;
        for (int& i = current[u]; i < (int)graph[u].size(); ++i) {
            Edge& edge = graph[u][i];
            if (edge.capacity == 0 || level[edge.to] != level[u] + 1) continue;
            ll flow = sendFlow(edge.to, sink, min(pushed, edge.capacity));
            if (flow == 0) continue;
            edge.capacity -= flow;
            graph[edge.to][edge.reverse].capacity += flow;
            return flow;
        }
        return 0;
    }

    ll maxFlow(int source, int sink) {
        ll answer = 0;
        while (buildLevelGraph(source, sink)) {
            fill(current.begin(), current.end(), 0);
            while (ll flow = sendFlow(source, sink, INF)) answer += flow;
        }
        return answer;
    }
};`,
  },
  {
    slug: "binary-lifting-lca",
    name: "BinaryLiftingLCA",
    cn: "倍增最近公共祖先",
    shortCode: "LC",
    category: "图论",
    priority: "高频",
    complexity: "预处理 O(n log n)，查询 O(log n)",
    summary: "使用 BFS 建树，避免深树递归爆栈，并支持祖先跳跃和距离计算。",
    bestFor: ["树上路径询问", "两点距离", "第 k 级祖先"],
    apis: [
      { signature: "jump(v, steps)", description: "将 v 向上跳 steps 层" },
      { signature: "lca(a, b)", description: "查询 a、b 的最近公共祖先" },
      { signature: "distance(a, b)", description: "查询树上边数距离" },
    ],
    notes: ["输入必须是一棵连通树", "根节点默认由构造参数指定"],
    code: `struct BinaryLiftingLCA {
    int n, log;
    vector<int> depth;
    vector<vector<int>> up;

    BinaryLiftingLCA(const vector<vector<int>>& tree, int root = 0)
        : n((int)tree.size()), depth(n, -1) {
        log = 1;
        while ((1 << log) <= max(1, n)) ++log;
        up.assign(log, vector<int>(n, root));

        // BFS 建树，比递归 DFS 更不容易在链形树上爆栈。
        queue<int> q;
        depth[root] = 0;
        up[0][root] = root;
        q.push(root);
        while (!q.empty()) {
            int u = q.front();
            q.pop();
            for (int v : tree[u]) {
                if (depth[v] != -1) continue;
                depth[v] = depth[u] + 1;
                up[0][v] = u;
                q.push(v);
            }
        }

        for (int k = 1; k < log; ++k) {
            for (int v = 0; v < n; ++v) {
                up[k][v] = up[k - 1][up[k - 1][v]];
            }
        }
    }

    int jump(int v, int steps) const {
        for (int k = 0; k < log; ++k) {
            if (steps >> k & 1) v = up[k][v];
        }
        return v;
    }

    int lca(int a, int b) const {
        if (depth[a] < depth[b]) swap(a, b);
        a = jump(a, depth[a] - depth[b]);
        if (a == b) return a;
        for (int k = log - 1; k >= 0; --k) {
            if (up[k][a] != up[k][b]) {
                a = up[k][a];
                b = up[k][b];
            }
        }
        return up[0][a];
    }

    int distance(int a, int b) const {
        int c = lca(a, b);
        return depth[a] + depth[b] - 2 * depth[c];
    }
};`,
  },
  {
    slug: "tarjan-scc",
    name: "TarjanSCC",
    cn: "强连通分量",
    shortCode: "SC",
    category: "图论",
    priority: "常用",
    complexity: "O(V + E)",
    summary: "一次 DFS 完成缩点编号，适合有向图环结构与 DAG 转化。",
    bestFor: ["有向图缩点", "判断强连通", "2-SAT 的基础组件"],
    apis: [
      { signature: "run()", description: "计算全部强连通分量" },
      { signature: "component[v]", description: "顶点 v 所在分量编号" },
    ],
    notes: ["分量编号范围为 [0, count)", "极深图可按需要改为手写栈"],
    code: `struct TarjanSCC {
    int n, timer = 0, componentCount = 0;
    const vector<vector<int>>& graph;
    vector<int> dfn, low, component, stack;
    vector<char> inStack;

    explicit TarjanSCC(const vector<vector<int>>& graph)
        : n((int)graph.size()), graph(graph), dfn(n), low(n),
          component(n, -1), inStack(n) {}

    void dfs(int u) {
        dfn[u] = low[u] = ++timer;
        stack.push_back(u);
        inStack[u] = true;

        for (int v : graph[u]) {
            if (dfn[v] == 0) {
                dfs(v);
                low[u] = min(low[u], low[v]);
            } else if (inStack[v]) {
                low[u] = min(low[u], dfn[v]);
            }
        }

        // u 是当前强连通分量在 DFS 树中的根。
        if (dfn[u] == low[u]) {
            while (true) {
                int v = stack.back();
                stack.pop_back();
                inStack[v] = false;
                component[v] = componentCount;
                if (v == u) break;
            }
            ++componentCount;
        }
    }

    int run() {
        for (int v = 0; v < n; ++v) {
            if (dfn[v] == 0) dfs(v);
        }
        return componentCount;
    }
};`,
  },
  {
    slug: "kmp",
    name: "KMP",
    cn: "字符串匹配",
    shortCode: "KM",
    category: "字符串",
    priority: "高频",
    complexity: "O(|text| + |pattern|)",
    summary: "前缀函数与匹配位置一次给全，适合边界、周期和模式串匹配。",
    bestFor: ["单模式串匹配", "字符串周期", "前后缀分析"],
    apis: [
      { signature: "prefixFunction(s)", description: "计算每个前缀的最长相等真前后缀" },
      { signature: "findOccurrences(text, pattern)", description: "返回全部匹配起点" },
    ],
    notes: ["允许匹配结果重叠", "空模式串按需单独处理"],
    code: `vector<int> prefixFunction(const string& s) {
    int n = (int)s.size();
    vector<int> pi(n);
    for (int i = 1; i < n; ++i) {
        int j = pi[i - 1];
        while (j > 0 && s[i] != s[j]) j = pi[j - 1];
        if (s[i] == s[j]) ++j;
        pi[i] = j;
    }
    return pi;
}

vector<int> findOccurrences(const string& text, const string& pattern) {
    vector<int> answer;
    if (pattern.empty()) return answer;
    vector<int> pi = prefixFunction(pattern);
    int matched = 0;

    for (int i = 0; i < (int)text.size(); ++i) {
        while (matched > 0 && text[i] != pattern[matched]) {
            matched = pi[matched - 1];
        }
        if (text[i] == pattern[matched]) ++matched;
        if (matched == (int)pattern.size()) {
            // 当前匹配的起点。
            answer.push_back(i - matched + 1);
            matched = pi[matched - 1];
        }
    }
    return answer;
}`,
  },
  {
    slug: "aho-corasick",
    name: "AhoCorasick",
    cn: "AC 自动机",
    shortCode: "AC",
    category: "字符串",
    priority: "进阶",
    complexity: "O(字符总数 + 文本长度)",
    summary: "多模式串同时匹配，自动补全失配转移并累计后缀模式数量。",
    bestFor: ["多模式串匹配", "敏感词统计", "Trie 上的 DP"],
    apis: [
      { signature: "insert(pattern)", description: "插入一个小写模式串" },
      { signature: "build()", description: "所有模式串插入后构建 fail 指针" },
      { signature: "countMatches(text)", description: "统计文本中的匹配总次数" },
    ],
    notes: ["当前字符集为 a-z", "必须先 insert，再 build，最后查询"],
    code: `struct AhoCorasick {
    static constexpr int ALPHABET = 26;

    struct Node {
        array<int, ALPHABET> next{};
        int fail = 0;
        int output = 0;
    };

    vector<Node> trie{Node{}};

    void insert(const string& pattern) {
        int u = 0;
        for (char ch : pattern) {
            int c = ch - 'a';
            if (trie[u].next[c] == 0) {
                trie[u].next[c] = (int)trie.size();
                trie.push_back(Node{});
            }
            u = trie[u].next[c];
        }
        ++trie[u].output;
    }

    void build() {
        queue<int> q;
        for (int c = 0; c < ALPHABET; ++c) {
            int v = trie[0].next[c];
            if (v != 0) q.push(v);
        }

        while (!q.empty()) {
            int u = q.front();
            q.pop();
            // fail 指向的节点结束的模式，也在当前节点结束。
            trie[u].output += trie[trie[u].fail].output;
            for (int c = 0; c < ALPHABET; ++c) {
                int v = trie[u].next[c];
                if (v != 0) {
                    trie[v].fail = trie[trie[u].fail].next[c];
                    q.push(v);
                } else {
                    trie[u].next[c] = trie[trie[u].fail].next[c];
                }
            }
        }
    }

    long long countMatches(const string& text) const {
        long long answer = 0;
        int state = 0;
        for (char ch : text) {
            state = trie[state].next[ch - 'a'];
            answer += trie[state].output;
        }
        return answer;
    }
};`,
  },
  {
    slug: "mod-int",
    name: "ModInt",
    cn: "模整数",
    shortCode: "MI",
    category: "数学",
    priority: "高频",
    complexity: "四则 O(1)，幂 / 逆元 O(log MOD)",
    summary: "把取模集中到类型内部，减少负数、乘法溢出和忘记取模的问题。",
    bestFor: ["组合计数", "动态规划取模", "多次快速幂与逆元"],
    apis: [
      { signature: "Mint::power(a, e)", description: "计算 a 的 e 次幂" },
      { signature: "a.inv()", description: "计算 a 的模逆元" },
      { signature: "+ - * /", description: "像普通整数一样运算" },
    ],
    notes: ["除法要求 MOD 为质数且除数非 0", "乘法中间值使用 long long"],
    code: `template<int MOD>
struct ModInt {
    int value;

    ModInt(long long x = 0) {
        x %= MOD;
        if (x < 0) x += MOD;
        value = (int)x;
    }

    ModInt& operator+=(const ModInt& other) {
        value += other.value;
        if (value >= MOD) value -= MOD;
        return *this;
    }

    ModInt& operator-=(const ModInt& other) {
        value -= other.value;
        if (value < 0) value += MOD;
        return *this;
    }

    ModInt& operator*=(const ModInt& other) {
        value = (int)(1LL * value * other.value % MOD);
        return *this;
    }

    static ModInt power(ModInt base, long long exponent) {
        ModInt result = 1;
        while (exponent > 0) {
            if (exponent & 1) result *= base;
            base *= base;
            exponent >>= 1;
        }
        return result;
    }

    // MOD 为质数时，使用费马小定理求逆元。
    ModInt inv() const {
        return power(*this, MOD - 2);
    }

    ModInt& operator/=(const ModInt& other) {
        return *this *= other.inv();
    }

    friend ModInt operator+(ModInt a, const ModInt& b) { return a += b; }
    friend ModInt operator-(ModInt a, const ModInt& b) { return a -= b; }
    friend ModInt operator*(ModInt a, const ModInt& b) { return a *= b; }
    friend ModInt operator/(ModInt a, const ModInt& b) { return a /= b; }
};

using Mint = ModInt<1000000007>;`,
  },
  {
    slug: "combinations",
    name: "Combinations",
    cn: "组合数预处理",
    shortCode: "CB",
    category: "数学",
    priority: "常用",
    complexity: "预处理 O(n + log MOD)，查询 O(1)",
    summary: "一次预处理阶乘与逆阶乘，之后常数时间计算质数模下的组合数。",
    bestFor: ["大量组合数查询", "计数问题", "概率与容斥"],
    apis: [{ signature: "C(n, k)", description: "返回组合数 C(n, k) mod MOD" }],
    notes: ["要求 MOD 为质数", "预处理上界必须覆盖所有 n 且 n < MOD"],
    code: `template<int MOD>
struct Combinations {
    vector<long long> factorial, inverseFactorial;

    static long long power(long long base, long long exponent) {
        long long result = 1;
        while (exponent > 0) {
            if (exponent & 1) result = result * base % MOD;
            base = base * base % MOD;
            exponent >>= 1;
        }
        return result;
    }

    explicit Combinations(int n)
        : factorial(n + 1, 1), inverseFactorial(n + 1, 1) {
        for (int i = 1; i <= n; ++i) {
            factorial[i] = factorial[i - 1] * i % MOD;
        }

        // 先求 n! 的逆元，再倒推所有逆阶乘。
        inverseFactorial[n] = power(factorial[n], MOD - 2);
        for (int i = n; i >= 1; --i) {
            inverseFactorial[i - 1] = inverseFactorial[i] * i % MOD;
        }
    }

    long long C(int n, int k) const {
        if (k < 0 || k > n) return 0;
        return factorial[n] * inverseFactorial[k] % MOD
             * inverseFactorial[n - k] % MOD;
    }
};

// 示例：Combinations<1000000007> comb(maxN);`,
  },
];

export function findContestTemplate(slug: string) {
  return contestTemplates.find((template) => template.slug === slug);
}
