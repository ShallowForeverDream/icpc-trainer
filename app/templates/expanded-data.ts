import type { ContestTemplate } from "./data";

// 这里保存可独立复制的扩展模块。代码刻意不做“万能化”：比赛中更短、更容易改。
export const expandedContestTemplates: ContestTemplate[] = [
  {
    slug: "contest-starter",
    name: "ContestStarter",
    cn: "比赛起手模板",
    shortCode: "IO",
    category: "基础",
    priority: "高频",
    complexity: "O(1) 框架",
    summary: "只放快速输入、常用整数类型、chmin / chmax 与本地调试，避免巨型头文件模板。",
    bestFor: ["每场比赛的初始文件", "多测题", "本地调试后直接提交"],
    apis: [
      { signature: "chmin(a, b) / chmax(a, b)", description: "更新成功时返回 true" },
      { signature: "debug(x, y, ...)", description: "仅在定义 LOCAL 时向 stderr 输出" },
      { signature: "solve()", description: "每组测试数据的唯一入口" },
    ],
    notes: ["提交前无需删除 debug，评测环境未定义 LOCAL 时不会输出", "默认单测；多测题取消 main 中对应注释"],
    code: `#include <bits/stdc++.h>
using namespace std;

using i64 = long long;
using i128 = __int128_t;

template<class T, class U>
bool chmin(T& value, const U& candidate) {
    if (candidate >= value) return false;
    value = candidate;
    return true;
}

template<class T, class U>
bool chmax(T& value, const U& candidate) {
    if (candidate <= value) return false;
    value = candidate;
    return true;
}

#ifdef LOCAL
template<class... Ts>
void debugOut(const Ts&... values) {
    ((cerr << values << ' '), ...);
    cerr << '\n';
}
#define debug(...) debugOut("[", #__VA_ARGS__, "] =", __VA_ARGS__)
#else
#define debug(...) ((void)0)
#endif

void solve() {
    // 读取一组数据并输出答案。
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int tests = 1;
    // cin >> tests;
    while (tests--) solve();
    return 0;
}`,
  },
  {
    slug: "binary-search-answer",
    name: "BinarySearchAnswer",
    cn: "答案二分",
    shortCode: "BS",
    category: "基础",
    priority: "高频",
    complexity: "O(log(range) · check)",
    summary: "把边界统一成半开区间 [low, high)，分别提供第一个可行与最后一个可行。",
    bestFor: ["最小化最大值", "最大化最小值", "单调判定问题"],
    apis: [
      { signature: "firstTrue(low, high, check)", description: "返回第一个满足 check 的位置；不存在时返回 high" },
      { signature: "lastTrue(low, high, check)", description: "返回最后一个满足 check 的位置；不存在时返回 low - 1" },
    ],
    notes: ["搜索范围是 [low, high)", "先写清 check 的单调方向，再选择函数"],
    code: `template<class Predicate>
long long firstTrue(long long low, long long high, Predicate check) {
    // check: false false ... false true true ... true
    while (low < high) {
        long long middle = low + (high - low) / 2;
        if (check(middle)) high = middle;
        else low = middle + 1;
    }
    return low;
}

template<class Predicate>
long long lastTrue(long long low, long long high, Predicate check) {
    // check: true true ... true false false ... false
    const long long first = low;
    while (low < high) {
        long long middle = low + (high - low) / 2;
        if (check(middle)) low = middle + 1;
        else high = middle;
    }
    return low == first ? first - 1 : low - 1;
}`,
  },
  {
    slug: "coordinate-compression",
    name: "CoordinateCompression",
    cn: "离散化",
    shortCode: "CC",
    category: "基础",
    priority: "高频",
    complexity: "构建 O(n log n)，查询 O(log n)",
    summary: "保留原值顺序关系，将稀疏大坐标映射到连续 0 下标。",
    bestFor: ["树状数组 / 线段树预处理", "大坐标计数", "扫描线"],
    apis: [
      { signature: "index(value)", description: "返回 value 的压缩下标" },
      { signature: "value(index)", description: "把压缩下标还原成原值" },
      { signature: "size()", description: "返回不同值的数量" },
    ],
    notes: ["index 默认查询构建时出现过的值", "同值会映射到同一位置"],
    code: `template<class T>
struct CoordinateCompression {
    vector<T> values;

    explicit CoordinateCompression(vector<T> input) : values(move(input)) {
        sort(values.begin(), values.end());
        values.erase(unique(values.begin(), values.end()), values.end());
    }

    int index(const T& value) const {
        return (int)(lower_bound(values.begin(), values.end(), value)
                   - values.begin());
    }

    const T& value(int index) const {
        return values[index];
    }

    int size() const {
        return (int)values.size();
    }
};`,
  },
  {
    slug: "merge-sort-inversions",
    name: "MergeSortInversions",
    cn: "归并排序与逆序对",
    shortCode: "MS",
    category: "基础",
    priority: "高频",
    complexity: "O(n log n)",
    summary: "在归并过程中统计跨区间逆序对，避免额外的数据结构。",
    bestFor: ["逆序对计数", "归并分治", "需要稳定排序的统计题"],
    apis: [{ signature: "countInversions(values)", description: "原地排序并返回逆序对数量" }],
    notes: ["答案最大约为 n(n-1)/2，必须使用 long long", "相等元素不计为逆序对"],
    code: `long long mergeAndCount(
    vector<long long>& values,
    vector<long long>& buffer,
    int left,
    int right
) {
    if (right - left <= 1) return 0;
    int middle = (left + right) / 2;
    long long answer = mergeAndCount(values, buffer, left, middle)
                     + mergeAndCount(values, buffer, middle, right);

    int i = left, j = middle, write = left;
    while (i < middle || j < right) {
        if (j == right || (i < middle && values[i] <= values[j])) {
            buffer[write++] = values[i++];
        } else {
            // values[j] 小于左半段剩余的每个数。
            answer += middle - i;
            buffer[write++] = values[j++];
        }
    }
    copy(buffer.begin() + left, buffer.begin() + right, values.begin() + left);
    return answer;
}

long long countInversions(vector<long long>& values) {
    vector<long long> buffer(values.size());
    return mergeAndCount(values, buffer, 0, (int)values.size());
}`,
  },
  {
    slug: "trie",
    name: "LowercaseTrie",
    cn: "字典树",
    shortCode: "TR",
    category: "字符串",
    priority: "常用",
    complexity: "插入 / 查询 O(|s|)",
    summary: "小写字母字典树，记录完整单词出现次数与前缀经过次数。",
    bestFor: ["前缀统计", "字符串集合查询", "异或 Trie 的结构基础"],
    apis: [
      { signature: "insert(word)", description: "插入一个小写字符串" },
      { signature: "count(word)", description: "返回完整字符串出现次数" },
      { signature: "prefixCount(prefix)", description: "返回拥有该前缀的字符串数" },
    ],
    notes: ["字符集固定为 a-z", "需要删除时再增加经过计数的减法"],
    code: `struct LowercaseTrie {
    struct Node {
        array<int, 26> next{};
        int pass = 0;
        int end = 0;

        Node() { next.fill(-1); }
    };

    vector<Node> nodes{1};

    void insert(const string& word) {
        int current = 0;
        ++nodes[current].pass;
        for (char ch : word) {
            int letter = ch - 'a';
            if (nodes[current].next[letter] == -1) {
                nodes[current].next[letter] = (int)nodes.size();
                nodes.emplace_back();
            }
            current = nodes[current].next[letter];
            ++nodes[current].pass;
        }
        ++nodes[current].end;
    }

    int walk(const string& text) const {
        int current = 0;
        for (char ch : text) {
            current = nodes[current].next[ch - 'a'];
            if (current == -1) return -1;
        }
        return current;
    }

    int count(const string& word) const {
        int node = walk(word);
        return node == -1 ? 0 : nodes[node].end;
    }

    int prefixCount(const string& prefix) const {
        int node = walk(prefix);
        return node == -1 ? 0 : nodes[node].pass;
    }
};`,
  },
  {
    slug: "sliding-window-maximum",
    name: "SlidingWindowMaximum",
    cn: "滑动窗口最值",
    shortCode: "DQ",
    category: "技巧",
    priority: "高频",
    complexity: "O(n)",
    summary: "单调双端队列维护每个固定长度窗口的最大值，每个下标最多进出一次。",
    bestFor: ["固定窗口最大 / 最小值", "区间 DP 优化", "双指针中的动态最值"],
    apis: [{ signature: "slidingWindowMaximum(values, k)", description: "返回所有长度为 k 的窗口最大值" }],
    notes: ["队列保存下标而不是值，便于移除过期元素", "改成最小值时反转维护比较符号"],
    code: `vector<int> slidingWindowMaximum(const vector<int>& values, int k) {
    if (k <= 0 || k > (int)values.size()) return {};

    deque<int> candidates;
    vector<int> answer;
    for (int right = 0; right < (int)values.size(); ++right) {
        while (!candidates.empty()
            && values[candidates.back()] <= values[right]) {
            candidates.pop_back();
        }
        candidates.push_back(right);

        int left = right - k + 1;
        if (candidates.front() < left) candidates.pop_front();
        if (left >= 0) answer.push_back(values[candidates.front()]);
    }
    return answer;
}`,
  },
  {
    slug: "monotonic-stack",
    name: "NearestStrictlySmaller",
    cn: "单调栈",
    shortCode: "MT",
    category: "技巧",
    priority: "高频",
    complexity: "O(n)",
    summary: "一次正扫、一次反扫，求每个位置两侧最近的严格更小元素。",
    bestFor: ["柱状图最大矩形", "子数组最小值贡献", "最近更大 / 更小位置"],
    apis: [{ signature: "nearestStrictlySmaller(values)", description: "返回 {left, right} 下标数组；不存在为 -1 / n" }],
    notes: ["为处理重复值，出栈条件使用 >=", "求严格更大时反转比较符号"],
    code: `pair<vector<int>, vector<int>> nearestStrictlySmaller(
    const vector<long long>& values
) {
    int n = (int)values.size();
    vector<int> left(n, -1), right(n, n), stack;

    for (int i = 0; i < n; ++i) {
        while (!stack.empty() && values[stack.back()] >= values[i]) {
            stack.pop_back();
        }
        if (!stack.empty()) left[i] = stack.back();
        stack.push_back(i);
    }

    stack.clear();
    for (int i = n - 1; i >= 0; --i) {
        while (!stack.empty() && values[stack.back()] >= values[i]) {
            stack.pop_back();
        }
        if (!stack.empty()) right[i] = stack.back();
        stack.push_back(i);
    }
    return {left, right};
}`,
  },
  {
    slug: "matrix-exponentiation",
    name: "MatrixExponentiation",
    cn: "矩阵快速幂",
    shortCode: "MX",
    category: "数学",
    priority: "常用",
    complexity: "O(n³ log exponent)",
    summary: "通用动态方阵快速幂，适合线性递推、状态转移与小维度计数。",
    bestFor: ["线性递推加速", "斐波那契类问题", "固定状态自动机计数"],
    apis: [
      { signature: "multiply(a, b, mod)", description: "返回矩阵乘积" },
      { signature: "matrixPower(base, exponent, mod)", description: "返回方阵的非负整数次幂" },
    ],
    notes: ["乘法中跳过 0 项可降低常数", "维度较大时应考虑稀疏转移或其他优化"],
    code: `using Matrix = vector<vector<long long>>;

Matrix multiply(const Matrix& a, const Matrix& b, long long mod) {
    int rows = (int)a.size();
    int common = (int)b.size();
    int columns = (int)b[0].size();
    Matrix result(rows, vector<long long>(columns));

    for (int i = 0; i < rows; ++i) {
        for (int k = 0; k < common; ++k) {
            if (a[i][k] == 0) continue;
            for (int j = 0; j < columns; ++j) {
                result[i][j] = (result[i][j]
                    + (__int128)a[i][k] * b[k][j]) % mod;
            }
        }
    }
    return result;
}

Matrix matrixPower(Matrix base, long long exponent, long long mod) {
    int n = (int)base.size();
    Matrix result(n, vector<long long>(n));
    for (int i = 0; i < n; ++i) result[i][i] = 1;

    while (exponent > 0) {
        if (exponent & 1) result = multiply(result, base, mod);
        base = multiply(base, base, mod);
        exponent >>= 1;
    }
    return result;
}`,
  },
  {
    slug: "manacher",
    name: "Manacher",
    cn: "回文半径",
    shortCode: "MA",
    category: "字符串",
    priority: "进阶",
    complexity: "O(n)",
    summary: "同时计算奇数与偶数长度回文半径，保留原串下标，便于继续做区间判断。",
    bestFor: ["最长回文子串", "回文区间统计", "回文性质 DP 的预处理"],
    apis: [{ signature: "manacher(text)", description: "返回 {odd, even}；半径包含中心字符对应长度" }],
    notes: ["odd[i] 表示以 i 为中心的奇回文半径", "even[i] 表示中心在 i-1 与 i 之间的偶回文半径"],
    code: `pair<vector<int>, vector<int>> manacher(const string& text) {
    int n = (int)text.size();
    vector<int> odd(n), even(n);

    for (int i = 0, left = 0, right = -1; i < n; ++i) {
        int radius = i > right ? 1 : min(odd[left + right - i], right - i + 1);
        while (i - radius >= 0 && i + radius < n
            && text[i - radius] == text[i + radius]) ++radius;
        odd[i] = radius--;
        if (i + radius > right) {
            left = i - radius;
            right = i + radius;
        }
    }

    for (int i = 0, left = 0, right = -1; i < n; ++i) {
        int radius = i > right ? 0 : min(even[left + right - i + 1], right - i + 1);
        while (i - radius - 1 >= 0 && i + radius < n
            && text[i - radius - 1] == text[i + radius]) ++radius;
        even[i] = radius--;
        if (i + radius > right) {
            left = i - radius - 1;
            right = i + radius;
        }
    }
    return {odd, even};
}`,
  },
  {
    slug: "reservoir-sampling",
    name: "ReservoirSampling",
    cn: "蓄水池抽样",
    shortCode: "RS",
    category: "技巧",
    priority: "进阶",
    complexity: "O(n) 时间，O(k) 空间",
    summary: "不知道数据总量或只能读取一遍时，从数据流中等概率保留 k 个元素。",
    bestFor: ["流式随机抽样", "数据无法全部存储", "随机化算法工具"],
    apis: [{ signature: "reservoirSample(input, k, rng)", description: "返回至多 k 个等概率样本" }],
    notes: ["随机数引擎由调用方传入，方便固定种子复现", "k 大于输入长度时返回全部输入"],
    code: `template<class T, class RandomEngine>
vector<T> reservoirSample(
    const vector<T>& input,
    int k,
    RandomEngine& rng
) {
    if (k <= 0) return {};
    int kept = min(k, (int)input.size());
    vector<T> sample(input.begin(), input.begin() + kept);

    for (int i = kept; i < (int)input.size(); ++i) {
        uniform_int_distribution<int> choose(0, i);
        int position = choose(rng);
        if (position < k) sample[position] = input[i];
    }
    return sample;
}`,
  },
  {
    slug: "splitmix-hash",
    name: "SplitMixHash",
    cn: "防卡哈希",
    shortCode: "HS",
    category: "技巧",
    priority: "常用",
    complexity: "均摊 O(1)",
    summary: "为整数键增加进程级随机扰动，降低 unordered_map 被构造碰撞数据卡掉的风险。",
    bestFor: ["对抗性输入", "大量整数哈希", "自定义 pair 键"],
    apis: [
      { signature: "CustomHash{}(value)", description: "对整数计算扰动哈希" },
      { signature: "CustomHash{}(pair)", description: "组合两个可转为整数的键" },
    ],
    notes: ["这不是密码学哈希", "普通数据规模下优先使用标准容器，遇到卡哈希风险再复制"],
    code: `struct CustomHash {
    static uint64_t splitmix64(uint64_t value) {
        value += 0x9e3779b97f4a7c15ULL;
        value = (value ^ (value >> 30)) * 0xbf58476d1ce4e5b9ULL;
        value = (value ^ (value >> 27)) * 0x94d049bb133111ebULL;
        return value ^ (value >> 31);
    }

    size_t operator()(uint64_t value) const {
        static const uint64_t seed = chrono::steady_clock::now()
            .time_since_epoch().count();
        return splitmix64(value + seed);
    }

    template<class A, class B>
    size_t operator()(const pair<A, B>& value) const {
        uint64_t first = operator()((uint64_t)value.first);
        uint64_t second = operator()((uint64_t)value.second);
        return splitmix64(first ^ (second + 0x9e3779b97f4a7c15ULL));
    }
};

// 示例：unordered_map<long long, int, CustomHash> frequency;`,
  },
  {
    slug: "ordered-set",
    name: "OrderedSet",
    cn: "可求排名的有序集合",
    shortCode: "OS",
    category: "数据结构",
    priority: "常用",
    complexity: "操作 O(log n)",
    summary: "GNU PBDS 红黑树，在 set 的基础上支持第 k 小与严格小于某值的元素个数。",
    bestFor: ["动态排名", "在线逆序对", "需要顺序统计量的集合"],
    apis: [
      { signature: "find_by_order(k)", description: "返回第 k 小元素的迭代器，0 下标" },
      { signature: "order_of_key(x)", description: "返回严格小于 x 的元素个数" },
    ],
    notes: ["只适用于支持 GNU PBDS 的 GCC 评测环境", "需要重复元素时存 pair<value, uniqueId>"],
    code: `#include <ext/pb_ds/assoc_container.hpp>
#include <ext/pb_ds/tree_policy.hpp>
using namespace __gnu_pbds;

template<class T>
using OrderedSet = tree<
    T,
    null_type,
    less<T>,
    rb_tree_tag,
    tree_order_statistics_node_update
>;

// OrderedSet<int> values;
// *values.find_by_order(k)  -> 第 k 小（0 下标）
// values.order_of_key(x)    -> 严格小于 x 的元素个数`,
  },
  {
    slug: "catalan-numbers",
    name: "CatalanNumbers",
    cn: "卡特兰数",
    shortCode: "CA",
    category: "数学",
    priority: "常用",
    complexity: "O(n log MOD)",
    summary: "按递推式预处理卡特兰数，适合括号序列、栈序列与不相交结构计数。",
    bestFor: ["合法括号序列", "二叉树形态计数", "不越界路径计数"],
    apis: [{ signature: "catalanNumbers(n, mod)", description: "返回 C0 到 Cn；mod 需为质数" }],
    notes: ["递推使用模逆元，要求 mod 为质数且 n + 1 < mod", "先确认题目对象确实满足卡特兰结构"],
    code: `long long modularPower(long long base, long long exponent, long long mod) {
    long long result = 1;
    while (exponent > 0) {
        if (exponent & 1) result = (__int128)result * base % mod;
        base = (__int128)base * base % mod;
        exponent >>= 1;
    }
    return result;
}

vector<long long> catalanNumbers(int n, long long mod) {
    vector<long long> catalan(n + 1, 1);
    for (long long i = 0; i < n; ++i) {
        // C(i+1) = C(i) * (4i + 2) / (i + 2)。
        catalan[i + 1] = (__int128)catalan[i] * (4 * i + 2) % mod;
        catalan[i + 1] = (__int128)catalan[i + 1]
                       * modularPower(i + 2, mod - 2, mod) % mod;
    }
    return catalan;
}`,
  },
  {
    slug: "longest-subarray-sum",
    name: "LongestSubarrayWithSum",
    cn: "指定和最长子数组",
    shortCode: "PS",
    category: "技巧",
    priority: "高频",
    complexity: "期望 O(n)",
    summary: "记录每个前缀和第一次出现的位置，在线求和恰好等于 target 的最长子数组。",
    bestFor: ["数组含负数的指定和区间", "最长平衡区间", "前缀和 + 哈希"],
    apis: [{ signature: "longestSubarrayWithSum(values, target)", description: "返回最长长度；不存在时为 0" }],
    notes: ["必须保留前缀和最早出现的位置", "元素全为正时滑动窗口通常更简单"],
    code: `int longestSubarrayWithSum(
    const vector<long long>& values,
    long long target
) {
    unordered_map<long long, int> earliest;
    earliest.reserve(values.size() * 2 + 1);
    earliest[0] = -1;

    long long prefix = 0;
    int answer = 0;
    for (int right = 0; right < (int)values.size(); ++right) {
        prefix += values[right];
        auto found = earliest.find(prefix - target);
        if (found != earliest.end()) {
            answer = max(answer, right - found->second);
        }
        earliest.emplace(prefix, right); // 已存在时不覆盖最早位置。
    }
    return answer;
}`,
  },
  {
    slug: "bitmask-dp-tsp",
    name: "BitmaskDPTsp",
    cn: "状压 DP",
    shortCode: "BD",
    category: "技巧",
    priority: "高频",
    complexity: "O(n² · 2ⁿ)",
    summary: "以旅行商回路为骨架展示 mask + last 状态，便于改造成集合选择类 DP。",
    bestFor: ["n ≤ 20 的集合状态", "旅行商与哈密顿路径", "小集合最优顺序"],
    apis: [{ signature: "travelingSalesman(distance)", description: "从 0 出发访问全部点并回到 0 的最短距离" }],
    notes: ["distance 必须是 n×n 矩阵", "若不要求回到起点，最后直接取 dp[full][last] 最小值"],
    code: `long long travelingSalesman(const vector<vector<long long>>& distance) {
    int n = (int)distance.size();
    if (n == 0) return 0;
    const long long INF = numeric_limits<long long>::max() / 4;
    int states = 1 << n;
    vector<vector<long long>> dp(states, vector<long long>(n, INF));
    dp[1][0] = 0;

    for (int mask = 1; mask < states; ++mask) {
        for (int last = 0; last < n; ++last) {
            if (!(mask >> last & 1) || dp[mask][last] == INF) continue;
            for (int next = 0; next < n; ++next) {
                if (mask >> next & 1) continue;
                int nextMask = mask | (1 << next);
                dp[nextMask][next] = min(
                    dp[nextMask][next],
                    dp[mask][last] + distance[last][next]
                );
            }
        }
    }

    long long answer = INF;
    for (int last = 0; last < n; ++last) {
        answer = min(answer, dp[states - 1][last] + distance[last][0]);
    }
    return answer;
}`,
  },
  {
    slug: "suffix-array",
    name: "SuffixArray",
    cn: "后缀数组与 LCP",
    shortCode: "SA",
    category: "字符串",
    priority: "进阶",
    complexity: "O(n log² n)",
    summary: "倍增构造后缀数组，并用 Kasai 算法在线性时间计算相邻后缀 LCP。",
    bestFor: ["后缀排序", "最长重复子串", "字符串子串比较"],
    apis: [
      { signature: "suffixArray(text)", description: "返回所有后缀按字典序排列的起点" },
      { signature: "lcpArray(text, suffixes)", description: "返回相邻后缀的最长公共前缀，长度为 n - 1" },
    ],
    notes: ["这是比赛中更易修改的倍增版，不追求 DC3 的极限线性复杂度", "空串会返回空数组"],
    code: `vector<int> suffixArray(const string& text) {
    int n = (int)text.size();
    vector<int> suffixes(n), rank(n), nextRank(n);
    iota(suffixes.begin(), suffixes.end(), 0);
    for (int i = 0; i < n; ++i) rank[i] = (unsigned char)text[i];

    for (int length = 1; length < n; length *= 2) {
        auto key = [&](int index) {
            return pair{rank[index], index + length < n ? rank[index + length] : -1};
        };
        sort(suffixes.begin(), suffixes.end(),
             [&](int a, int b) { return key(a) < key(b); });

        nextRank[suffixes[0]] = 0;
        for (int i = 1; i < n; ++i) {
            nextRank[suffixes[i]] = nextRank[suffixes[i - 1]]
                                  + (key(suffixes[i - 1]) != key(suffixes[i]));
        }
        rank.swap(nextRank);
        if (rank[suffixes.back()] == n - 1) break;
    }
    return suffixes;
}

vector<int> lcpArray(const string& text, const vector<int>& suffixes) {
    int n = (int)text.size();
    if (n <= 1) return {};
    vector<int> rank(n), lcp(n - 1);
    for (int i = 0; i < n; ++i) rank[suffixes[i]] = i;

    int matched = 0;
    for (int start = 0; start < n; ++start) {
        int position = rank[start];
        if (position == n - 1) {
            matched = 0;
            continue;
        }
        int other = suffixes[position + 1];
        while (start + matched < n && other + matched < n
            && text[start + matched] == text[other + matched]) ++matched;
        lcp[position] = matched;
        if (matched > 0) --matched;
    }
    return lcp;
}`,
  },
  {
    slug: "kruskal",
    name: "KruskalMST",
    cn: "Kruskal 最小生成树",
    shortCode: "KR",
    category: "图论",
    priority: "高频",
    complexity: "O(E log E)",
    summary: "按边权排序并用并查集跳过成环边，同时返回总权值与选中的边。",
    bestFor: ["无向图最小生成树", "最小生成森林", "按权值逐步连通"],
    apis: [{ signature: "kruskal(n, edges)", description: "返回 {总权值, 选中边}；不连通时得到生成森林" }],
    notes: ["若要求整张图连通，检查选中边数是否为 n - 1", "边编号使用 [0, n)"],
    code: `struct MstEdge {
    int from, to;
    long long weight;
};

struct KruskalDSU {
    vector<int> parent, size;
    explicit KruskalDSU(int n) : parent(n), size(n, 1) {
        iota(parent.begin(), parent.end(), 0);
    }
    int find(int x) {
        return parent[x] == x ? x : parent[x] = find(parent[x]);
    }
    bool unite(int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return false;
        if (size[a] < size[b]) swap(a, b);
        parent[b] = a;
        size[a] += size[b];
        return true;
    }
};

pair<long long, vector<MstEdge>> kruskal(int n, vector<MstEdge> edges) {
    sort(edges.begin(), edges.end(), [](const MstEdge& a, const MstEdge& b) {
        return a.weight < b.weight;
    });

    KruskalDSU dsu(n);
    long long total = 0;
    vector<MstEdge> chosen;
    for (const MstEdge& edge : edges) {
        if (!dsu.unite(edge.from, edge.to)) continue;
        total += edge.weight;
        chosen.push_back(edge);
    }
    return {total, chosen};
}`,
  },
  {
    slug: "topological-sort",
    name: "TopologicalSort",
    cn: "拓扑排序",
    shortCode: "TP",
    category: "图论",
    priority: "高频",
    complexity: "O(V + E)",
    summary: "Kahn 算法生成一个拓扑序；若结果长度不足 n，则图中存在有向环。",
    bestFor: ["DAG 依赖顺序", "拓扑 DP", "有向图判环"],
    apis: [{ signature: "topologicalSort(graph)", description: "返回拓扑序；有环时返回空数组" }],
    notes: ["graph[u] 保存从 u 出发的有向边", "需要字典序最小时把 queue 换成小根堆"],
    code: `vector<int> topologicalSort(const vector<vector<int>>& graph) {
    int n = (int)graph.size();
    vector<int> indegree(n);
    for (const auto& edges : graph) {
        for (int to : edges) ++indegree[to];
    }

    queue<int> ready;
    for (int node = 0; node < n; ++node) {
        if (indegree[node] == 0) ready.push(node);
    }

    vector<int> order;
    while (!ready.empty()) {
        int node = ready.front();
        ready.pop();
        order.push_back(node);
        for (int to : graph[node]) {
            if (--indegree[to] == 0) ready.push(to);
        }
    }
    if ((int)order.size() != n) return {};
    return order;
}`,
  },
  {
    slug: "morris-traversal",
    name: "MorrisInorder",
    cn: "Morris 遍历",
    shortCode: "MO",
    category: "技巧",
    priority: "进阶",
    complexity: "O(n) 时间，O(1) 额外空间",
    summary: "借用前驱节点的空右指针完成中序遍历，离开子树时恢复原树结构。",
    bestFor: ["要求 O(1) 额外空间的树遍历", "理解线索二叉树", "二叉树结构判定"],
    apis: [{ signature: "morrisInorder(root)", description: "返回中序遍历结果，并恢复所有临时指针" }],
    notes: ["临时修改树指针，任何提前 return 都可能破坏结构", "普通比赛题优先使用更直观的递归或显式栈"],
    code: `struct TreeNode {
    int value;
    TreeNode* left = nullptr;
    TreeNode* right = nullptr;
};

vector<int> morrisInorder(TreeNode* root) {
    vector<int> order;
    TreeNode* current = root;

    while (current != nullptr) {
        if (current->left == nullptr) {
            order.push_back(current->value);
            current = current->right;
            continue;
        }

        TreeNode* predecessor = current->left;
        while (predecessor->right != nullptr
            && predecessor->right != current) {
            predecessor = predecessor->right;
        }

        if (predecessor->right == nullptr) {
            predecessor->right = current; // 第一次到达，建立返回线索。
            current = current->left;
        } else {
            predecessor->right = nullptr; // 第二次到达，恢复原树。
            order.push_back(current->value);
            current = current->right;
        }
    }
    return order;
}`,
  },
  {
    slug: "bfprt-selection",
    name: "BFPRTSelection",
    cn: "线性选择 BFPRT",
    shortCode: "BF",
    category: "技巧",
    priority: "进阶",
    complexity: "最坏 O(n)",
    summary: "五个一组选择中位数作为枢轴，在最坏情况下线性求第 k 小。",
    bestFor: ["需要最坏复杂度保证的第 k 小", "避免随机枢轴退化", "选择算法学习"],
    apis: [{ signature: "kthSmallest(values, k)", description: "返回 0 下标第 k 小；函数内部复制并修改数组" }],
    notes: ["多数比赛场景 nth_element 更短且更快", "k 必须满足 0 ≤ k < n"],
    code: `int bfprtSelect(vector<int>& values, int left, int right, int k);

int medianOfMedians(vector<int>& values, int left, int right) {
    vector<int> medians;
    for (int start = left; start < right; start += 5) {
        int finish = min(start + 5, right);
        sort(values.begin() + start, values.begin() + finish);
        medians.push_back(values[start + (finish - start) / 2]);
    }
    if (medians.size() == 1) return medians[0];
    return bfprtSelect(medians, 0, (int)medians.size(), medians.size() / 2);
}

pair<int, int> partitionByPivot(
    vector<int>& values,
    int left,
    int right,
    int pivot
) {
    int smaller = left, current = left, greater = right;
    while (current < greater) {
        if (values[current] < pivot) swap(values[smaller++], values[current++]);
        else if (values[current] > pivot) swap(values[current], values[--greater]);
        else ++current;
    }
    return {smaller, greater}; // 等于 pivot 的区间是 [smaller, greater)。
}

int bfprtSelect(vector<int>& values, int left, int right, int k) {
    if (right - left == 1) return values[left];
    int pivot = medianOfMedians(values, left, right);
    auto [equalLeft, equalRight] = partitionByPivot(values, left, right, pivot);
    if (k < equalLeft) return bfprtSelect(values, left, equalLeft, k);
    if (k >= equalRight) return bfprtSelect(values, equalRight, right, k);
    return pivot;
}

int kthSmallest(vector<int> values, int k) {
    return bfprtSelect(values, 0, (int)values.size(), k);
}`,
  },
];
