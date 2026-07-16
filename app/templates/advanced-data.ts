import type { ContestTemplate } from "./data";

export const advancedContestTemplates: ContestTemplate[] = [
  {
    slug: "linear-sieve",
    name: "LinearSieve",
    cn: "线性筛与欧拉函数",
    shortCode: "LS",
    category: "数学",
    priority: "高频",
    complexity: "预处理 O(n)",
    summary: "一次预处理质数、最小质因子、欧拉函数与莫比乌斯函数，适合数论题统一起手。",
    bestFor: ["质数与最小质因子", "欧拉函数", "莫比乌斯反演预处理"],
    apis: [
      { signature: "LinearSieve(n)", description: "预处理 [1, n]" },
      { signature: "isPrime(x)", description: "判断 x 是否为质数" },
      { signature: "factorize(x)", description: "利用最小质因子分解 x" },
    ],
    notes: ["minPrime[1] 为 0", "factorize 的 x 必须不超过构造时的 n"],
    code: `struct LinearSieve {
    vector<int> primes, minPrime, phi, mu;

    explicit LinearSieve(int n)
        : minPrime(n + 1), phi(n + 1), mu(n + 1) {
        phi[1] = 1;
        mu[1] = 1;
        for (int value = 2; value <= n; ++value) {
            if (minPrime[value] == 0) {
                minPrime[value] = value;
                phi[value] = value - 1;
                mu[value] = -1;
                primes.push_back(value);
            }
            for (int prime : primes) {
                if (prime > minPrime[value] || 1LL * value * prime > n) break;
                int product = value * prime;
                minPrime[product] = prime;
                if (value % prime == 0) {
                    phi[product] = phi[value] * prime;
                    mu[product] = 0;
                    break;
                }
                phi[product] = phi[value] * (prime - 1);
                mu[product] = -mu[value];
            }
        }
    }

    bool isPrime(int value) const {
        return value >= 2 && minPrime[value] == value;
    }

    vector<pair<int, int>> factorize(int value) const {
        vector<pair<int, int>> factors;
        while (value > 1) {
            int prime = minPrime[value], exponent = 0;
            do {
                value /= prime;
                ++exponent;
            } while (value > 1 && minPrime[value] == prime);
            factors.push_back({prime, exponent});
        }
        return factors;
    }
};`,
  },
  {
    slug: "extended-crt",
    name: "ExtendedCRT",
    cn: "扩展中国剩余定理",
    shortCode: "CR",
    category: "数学",
    priority: "常用",
    complexity: "合并一次 O(log mod)",
    summary: "逐个合并不要求模数互质的同余方程，并显式报告无解与 long long 溢出。",
    bestFor: ["同余方程组", "周期同步", "模数不互质的 CRT"],
    apis: [
      { signature: "mergeCongruence(a, m, b, n)", description: "合并 x≡a(mod m) 与 x≡b(mod n)" },
      { signature: "extendedCRT(equations)", description: "返回最小非负解与总模数；无解返回 nullopt" },
    ],
    notes: ["所有模数必须为正", "返回 nullopt 也可能表示合并后的模数超出 long long"],
    code: `using i64 = long long;
using i128 = __int128_t;

i64 extendedGcd(i64 a, i64 b, i64& x, i64& y) {
    if (b == 0) {
        x = a >= 0 ? 1 : -1;
        y = 0;
        return llabs(a);
    }
    i64 nextX, nextY;
    i64 gcd = extendedGcd(b, a % b, nextX, nextY);
    x = nextY;
    y = nextX - (a / b) * nextY;
    return gcd;
}

i64 normalizeMod(i128 value, i64 mod) {
    value %= mod;
    if (value < 0) value += mod;
    return (i64)value;
}

optional<pair<i64, i64>> mergeCongruence(i64 a, i64 m, i64 b, i64 n) {
    if (m <= 0 || n <= 0) return nullopt;
    a = normalizeMod(a, m);
    b = normalizeMod(b, n);
    i64 x, y;
    i64 gcd = extendedGcd(m, n, x, y);
    i64 difference = b - a;
    if (difference % gcd != 0) return nullopt;

    i64 reducedMod = n / gcd;
    i64 step = normalizeMod((i128)(difference / gcd) * x, reducedMod);
    i128 lcm = (i128)m / gcd * n;
    if (lcm > numeric_limits<i64>::max()) return nullopt;
    i64 modulus = (i64)lcm;
    i64 answer = normalizeMod((i128)a + (i128)m * step, modulus);
    return pair<i64, i64>{answer, modulus};
}

optional<pair<i64, i64>> extendedCRT(const vector<pair<i64, i64>>& equations) {
    pair<i64, i64> current{0, 1};
    for (auto [remainder, modulus] : equations) {
        auto merged = mergeCongruence(current.first, current.second, remainder, modulus);
        if (!merged) return nullopt;
        current = *merged;
    }
    return current;
}`,
  },
  {
    slug: "two-sat",
    name: "TwoSAT",
    cn: "2-SAT",
    shortCode: "2S",
    category: "图论",
    priority: "常用",
    complexity: "O(n + m)",
    summary: "用两遍 DFS 的强连通分量判定布尔约束，并直接恢复一组可行赋值。",
    bestFor: ["二选一约束", "互斥与蕴含关系", "方案可行性"],
    apis: [
      { signature: "addOr(x, xv, y, yv)", description: "加入 (x=xv) 或 (y=yv)" },
      { signature: "addImplication(x, xv, y, yv)", description: "加入 (x=xv) 推出 (y=yv)" },
      { signature: "solve()", description: "求一组赋值；无解返回 false" },
    ],
    notes: ["变量编号为 [0, n)", "literal(x, true) 表示变量 x 取真"],
    code: `struct TwoSAT {
    int variables;
    vector<vector<int>> graph, reverseGraph;
    vector<int> assignment;

    explicit TwoSAT(int n)
        : variables(n), graph(2 * n), reverseGraph(2 * n), assignment(n) {}

    int literal(int variable, bool value) const {
        return 2 * variable + (value ? 0 : 1);
    }

    void addEdge(int from, int to) {
        graph[from].push_back(to);
        reverseGraph[to].push_back(from);
    }

    void addImplication(int x, bool xValue, int y, bool yValue) {
        int from = literal(x, xValue), to = literal(y, yValue);
        addEdge(from, to);
        addEdge(to ^ 1, from ^ 1);
    }

    void addOr(int x, bool xValue, int y, bool yValue) {
        addImplication(x, !xValue, y, yValue);
        addImplication(y, !yValue, x, xValue);
    }

    void forceValue(int x, bool value) {
        addImplication(x, !value, x, value);
    }

    bool solve() {
        int nodes = 2 * variables;
        vector<char> visited(nodes);
        vector<int> order, component(nodes, -1);
        auto dfs1 = [&](auto&& self, int node) -> void {
            visited[node] = true;
            for (int next : graph[node]) if (!visited[next]) self(self, next);
            order.push_back(node);
        };
        auto dfs2 = [&](auto&& self, int node, int id) -> void {
            component[node] = id;
            for (int next : reverseGraph[node]) if (component[next] == -1) self(self, next, id);
        };
        for (int node = 0; node < nodes; ++node) if (!visited[node]) dfs1(dfs1, node);
        reverse(order.begin(), order.end());
        int componentCount = 0;
        for (int node : order) if (component[node] == -1) dfs2(dfs2, node, componentCount++);

        for (int variable = 0; variable < variables; ++variable) {
            int isTrue = literal(variable, true), isFalse = literal(variable, false);
            if (component[isTrue] == component[isFalse]) return false;
            assignment[variable] = component[isTrue] > component[isFalse];
        }
        return true;
    }
};`,
  },
  {
    slug: "min-cost-max-flow",
    name: "MinCostMaxFlow",
    cn: "最小费用最大流",
    shortCode: "MF",
    category: "图论",
    priority: "进阶",
    complexity: "O(flow · E log V)",
    summary: "势能加 Dijkstra 的费用流实现，支持负费用正向边并返回实际流量与总费用。",
    bestFor: ["带代价匹配", "分配与运输", "要求最大流下最小费用"],
    apis: [
      { signature: "addEdge(u, v, cap, cost)", description: "加入容量 cap、单位费用 cost 的有向边" },
      { signature: "minCostFlow(s, t, limit)", description: "最多发送 limit 单位流，返回 {flow, cost}" },
    ],
    notes: ["容量与费用均使用 long long", "若只需指定流量，检查返回 flow 是否达到 limit"],
    code: `struct MinCostMaxFlow {
    using i64 = long long;
    static constexpr i64 INF = numeric_limits<i64>::max() / 4;

    struct Edge {
        int to, reverseIndex;
        i64 capacity, cost;
    };

    int n;
    vector<vector<Edge>> graph;

    explicit MinCostMaxFlow(int n) : n(n), graph(n) {}

    void addEdge(int from, int to, i64 capacity, i64 cost) {
        int fromIndex = (int)graph[from].size();
        int toIndex = (int)graph[to].size();
        graph[from].push_back({to, toIndex, capacity, cost});
        graph[to].push_back({from, fromIndex, 0, -cost});
    }

    pair<i64, i64> minCostFlow(int source, int sink, i64 limit = INF) {
        vector<i64> potential(n, INF);
        vector<char> inQueue(n);
        queue<int> queue;
        potential[source] = 0;
        queue.push(source);
        while (!queue.empty()) {
            int node = queue.front();
            queue.pop();
            inQueue[node] = false;
            for (const Edge& edge : graph[node]) {
                if (!edge.capacity || potential[edge.to] <= potential[node] + edge.cost) continue;
                potential[edge.to] = potential[node] + edge.cost;
                if (!inQueue[edge.to]) queue.push(edge.to), inQueue[edge.to] = true;
            }
        }
        for (i64& value : potential) if (value == INF) value = 0;

        i64 flow = 0, cost = 0;
        vector<i64> distance(n);
        vector<int> parentNode(n), parentEdge(n);
        while (flow < limit) {
            fill(distance.begin(), distance.end(), INF);
            priority_queue<pair<i64, int>, vector<pair<i64, int>>, greater<pair<i64, int>>> heap;
            distance[source] = 0;
            heap.push({0, source});
            while (!heap.empty()) {
                auto [currentDistance, node] = heap.top();
                heap.pop();
                if (currentDistance != distance[node]) continue;
                for (int index = 0; index < (int)graph[node].size(); ++index) {
                    const Edge& edge = graph[node][index];
                    if (!edge.capacity) continue;
                    i64 nextDistance = currentDistance + edge.cost + potential[node] - potential[edge.to];
                    if (nextDistance >= distance[edge.to]) continue;
                    distance[edge.to] = nextDistance;
                    parentNode[edge.to] = node;
                    parentEdge[edge.to] = index;
                    heap.push({nextDistance, edge.to});
                }
            }
            if (distance[sink] == INF) break;
            for (int node = 0; node < n; ++node) if (distance[node] < INF) potential[node] += distance[node];

            i64 pushed = limit - flow;
            for (int node = sink; node != source; node = parentNode[node]) {
                pushed = min(pushed, graph[parentNode[node]][parentEdge[node]].capacity);
            }
            for (int node = sink; node != source; node = parentNode[node]) {
                Edge& edge = graph[parentNode[node]][parentEdge[node]];
                cost += pushed * edge.cost;
                edge.capacity -= pushed;
                graph[node][edge.reverseIndex].capacity += pushed;
            }
            flow += pushed;
        }
        return {flow, cost};
    }
};`,
  },
  {
    slug: "heavy-light-decomposition",
    name: "HeavyLightDecomposition",
    cn: "树链剖分",
    shortCode: "HL",
    category: "数据结构",
    priority: "常用",
    complexity: "预处理 O(n)，路径 O(log n) 段",
    summary: "把树上路径拆成少量连续区间，可直接接线段树处理路径修改与查询。",
    bestFor: ["树上路径查询", "路径修改", "LCA 与子树区间"],
    apis: [
      { signature: "build(root)", description: "计算父亲、重儿子与 DFS 序" },
      { signature: "forEachPath(u, v, callback)", description: "把路径拆成若干闭区间 [l, r]" },
      { signature: "subtreeRange(u)", description: "返回 u 子树对应的半开区间" },
    ],
    notes: ["forEachPath 不保证区间按路径方向出现", "边权下放到儿子时需排除 LCA 对应位置"],
    code: `struct HeavyLightDecomposition {
    int n, timer = 0;
    vector<vector<int>> graph;
    vector<int> parent, depth, subtreeSize, heavyChild, head, position;

    explicit HeavyLightDecomposition(int n)
        : n(n), graph(n), parent(n, -1), depth(n), subtreeSize(n),
          heavyChild(n, -1), head(n), position(n) {}

    void addEdge(int u, int v) {
        graph[u].push_back(v);
        graph[v].push_back(u);
    }

    int prepare(int node, int parentNode) {
        parent[node] = parentNode;
        subtreeSize[node] = 1;
        int bestSize = 0;
        for (int next : graph[node]) if (next != parentNode) {
            depth[next] = depth[node] + 1;
            int childSize = prepare(next, node);
            subtreeSize[node] += childSize;
            if (childSize > bestSize) bestSize = childSize, heavyChild[node] = next;
        }
        return subtreeSize[node];
    }

    void decompose(int node, int chainHead) {
        head[node] = chainHead;
        position[node] = timer++;
        if (heavyChild[node] != -1) decompose(heavyChild[node], chainHead);
        for (int next : graph[node]) {
            if (next == parent[node] || next == heavyChild[node]) continue;
            decompose(next, next);
        }
    }

    void build(int root = 0) {
        timer = 0;
        depth[root] = 0;
        prepare(root, -1);
        decompose(root, root);
    }

    template<class Callback>
    void forEachPath(int u, int v, Callback callback) const {
        while (head[u] != head[v]) {
            if (depth[head[u]] < depth[head[v]]) swap(u, v);
            callback(position[head[u]], position[u]);
            u = parent[head[u]];
        }
        if (depth[u] > depth[v]) swap(u, v);
        callback(position[u], position[v]);
    }

    int lca(int u, int v) const {
        while (head[u] != head[v]) {
            if (depth[head[u]] < depth[head[v]]) swap(u, v);
            u = parent[head[u]];
        }
        return depth[u] < depth[v] ? u : v;
    }

    pair<int, int> subtreeRange(int node) const {
        return {position[node], position[node] + subtreeSize[node]};
    }
};`,
  },
  {
    slug: "persistent-kth-segment-tree",
    name: "PersistentKthSegmentTree",
    cn: "主席树区间第 k 小",
    shortCode: "PK",
    category: "数据结构",
    priority: "进阶",
    complexity: "建树 O(n log V)，查询 O(log V)",
    summary: "为每个前缀保存频率线段树版本，通过两个根相减回答静态区间第 k 小。",
    bestFor: ["静态区间第 k 小", "区间值域计数", "可持久化前缀频率"],
    apis: [
      { signature: "build(values)", description: "离散化并建立所有前缀版本" },
      { signature: "kth(left, right, k)", description: "查询 values[left..right) 的第 k 小，k 从 1 开始" },
    ],
    notes: ["查询区间使用 [left, right)", "k 必须满足 1≤k≤right-left"],
    code: `struct PersistentKthSegmentTree {
    struct Node {
        int left = 0, right = 0, count = 0;
    };

    vector<Node> nodes{{}};
    vector<int> roots{0};
    vector<int> coordinates;

    int update(int previous, int low, int high, int target) {
        int current = (int)nodes.size();
        nodes.push_back(nodes[previous]);
        ++nodes[current].count;
        if (high - low == 1) return current;
        int middle = (low + high) / 2;
        if (target < middle) nodes[current].left = update(nodes[previous].left, low, middle, target);
        else nodes[current].right = update(nodes[previous].right, middle, high, target);
        return current;
    }

    void build(const vector<int>& values) {
        coordinates = values;
        sort(coordinates.begin(), coordinates.end());
        coordinates.erase(unique(coordinates.begin(), coordinates.end()), coordinates.end());
        nodes.assign(1, {});
        roots.assign(1, 0);
        nodes.reserve(1 + values.size() * 20);
        for (int value : values) {
            int rank = lower_bound(coordinates.begin(), coordinates.end(), value) - coordinates.begin();
            roots.push_back(update(roots.back(), 0, (int)coordinates.size(), rank));
        }
    }

    int kthRank(int leftRoot, int rightRoot, int low, int high, int k) const {
        if (high - low == 1) return low;
        int leftCount = nodes[nodes[rightRoot].left].count - nodes[nodes[leftRoot].left].count;
        int middle = (low + high) / 2;
        if (k <= leftCount) return kthRank(nodes[leftRoot].left, nodes[rightRoot].left, low, middle, k);
        return kthRank(nodes[leftRoot].right, nodes[rightRoot].right, middle, high, k - leftCount);
    }

    int kth(int left, int right, int k) const {
        int rank = kthRank(roots[left], roots[right], 0, (int)coordinates.size(), k);
        return coordinates[rank];
    }
};`,
  },
  {
    slug: "li-chao-tree",
    name: "LiChaoTree",
    cn: "李超线段树",
    shortCode: "LC",
    category: "数据结构",
    priority: "进阶",
    complexity: "插入 / 查询 O(log range)",
    summary: "在固定整数横坐标范围维护一次函数最小值，避免手写斜率排序与交点精度。",
    bestFor: ["动态加入直线", "DP 斜率优化", "离散时间最小代价"],
    apis: [
      { signature: "addLine(slope, intercept)", description: "加入 y=slope·x+intercept" },
      { signature: "query(x)", description: "查询给定整数 x 处的最小值" },
    ],
    notes: ["构造区间 [low, high] 为闭区间", "若要求最大值，可对斜率和截距取反"],
    code: `struct LiChaoTree {
    using i64 = long long;
    using i128 = __int128_t;
    static constexpr i64 INF = numeric_limits<i64>::max() / 4;

    struct Line {
        i64 slope = 0, intercept = INF;
        i128 value(i64 x) const { return (i128)slope * x + intercept; }
    };
    struct Node {
        Line line;
        int left = -1, right = -1;
    };

    i64 low, high;
    vector<Node> nodes{{}};

    LiChaoTree(i64 low, i64 high) : low(low), high(high) {}

    void addLine(Line line) { addLine(0, low, high, line); }

    void addLine(int node, i64 left, i64 right, Line line) {
        i64 middle = left + (right - left) / 2;
        bool betterLeft = line.value(left) < nodes[node].line.value(left);
        bool betterMiddle = line.value(middle) < nodes[node].line.value(middle);
        if (betterMiddle) swap(line, nodes[node].line);
        if (left == right) return;
        if (betterLeft != betterMiddle) {
            if (nodes[node].left == -1) nodes[node].left = newNode();
            addLine(nodes[node].left, left, middle, line);
        } else {
            if (nodes[node].right == -1) nodes[node].right = newNode();
            addLine(nodes[node].right, middle + 1, right, line);
        }
    }

    i64 query(i64 x) const {
        i128 answer = query(0, low, high, x);
        if (answer >= INF) return INF;
        if (answer <= -INF) return -INF;
        return (i64)answer;
    }

    i128 query(int node, i64 left, i64 right, i64 x) const {
        i128 answer = nodes[node].line.value(x);
        if (left == right) return answer;
        i64 middle = left + (right - left) / 2;
        int next = x <= middle ? nodes[node].left : nodes[node].right;
        if (next == -1) return answer;
        if (x <= middle) return min(answer, query(next, left, middle, x));
        return min(answer, query(next, middle + 1, right, x));
    }

    int newNode() {
        nodes.push_back({});
        return (int)nodes.size() - 1;
    }
};`,
  },
  {
    slug: "ntt-convolution",
    name: "NTTConvolution",
    cn: "NTT 多项式卷积",
    shortCode: "NT",
    category: "数学",
    priority: "进阶",
    complexity: "O(n log n)",
    summary: "基于 998244353 的迭代 NTT，提供可直接调用的整数多项式卷积。",
    bestFor: ["多项式乘法", "计数生成函数", "大规模卷积"],
    apis: [
      { signature: "ntt(values, invert)", description: "原地进行正变换或逆变换" },
      { signature: "convolution(a, b)", description: "返回两个多项式的卷积" },
    ],
    notes: ["系数模数固定为 998244353", "结果长度为 a.size()+b.size()-1"],
    code: `constexpr int NTT_MOD = 998244353;
constexpr int NTT_ROOT = 3;

int modPower(int base, int exponent) {
    long long result = 1;
    while (exponent > 0) {
        if (exponent & 1) result = result * base % NTT_MOD;
        base = (long long)base * base % NTT_MOD;
        exponent >>= 1;
    }
    return (int)result;
}

void ntt(vector<int>& values, bool invert) {
    int n = (int)values.size();
    for (int i = 1, j = 0; i < n; ++i) {
        int bit = n >> 1;
        while (j & bit) j ^= bit, bit >>= 1;
        j ^= bit;
        if (i < j) swap(values[i], values[j]);
    }
    for (int length = 2; length <= n; length <<= 1) {
        int root = modPower(NTT_ROOT, (NTT_MOD - 1) / length);
        if (invert) root = modPower(root, NTT_MOD - 2);
        for (int start = 0; start < n; start += length) {
            long long factor = 1;
            for (int offset = 0; offset < length / 2; ++offset) {
                int even = values[start + offset];
                int odd = factor * values[start + offset + length / 2] % NTT_MOD;
                values[start + offset] = even + odd < NTT_MOD ? even + odd : even + odd - NTT_MOD;
                values[start + offset + length / 2] = even - odd >= 0 ? even - odd : even - odd + NTT_MOD;
                factor = factor * root % NTT_MOD;
            }
        }
    }
    if (invert) {
        int inverseN = modPower(n, NTT_MOD - 2);
        for (int& value : values) value = (long long)value * inverseN % NTT_MOD;
    }
}

vector<int> convolution(vector<int> left, vector<int> right) {
    if (left.empty() || right.empty()) return {};
    int resultSize = (int)left.size() + (int)right.size() - 1;
    int size = 1;
    while (size < resultSize) size <<= 1;
    left.resize(size);
    right.resize(size);
    ntt(left, false);
    ntt(right, false);
    for (int i = 0; i < size; ++i) left[i] = (long long)left[i] * right[i] % NTT_MOD;
    ntt(left, true);
    left.resize(resultSize);
    return left;
}`,
  },
];
