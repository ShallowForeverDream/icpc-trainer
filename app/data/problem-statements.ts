export type ProblemExample = {
  input: string;
  output: string;
};

export type ImportedProblemStatement = {
  titleZh: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  descriptionZh: string[];
  inputZh: string[];
  outputZh: string[];
  examples: ProblemExample[];
  noteZh?: string[];
};

const statements: Record<string, ImportedProblemStatement> = {
  "4a": {
    titleZh: "西瓜",
    timeLimitSeconds: 1,
    memoryLimitMb: 64,
    descriptionZh: [
      "一个炎热的夏日，Pete 和 Billy 买了一个重 w 千克的西瓜。他们想把西瓜分成两部分，并且每一部分的重量都必须是正偶数。两部分不必同样重。",
      "请判断是否存在这样的分法。",
    ],
    inputZh: ["唯一一行包含整数 w（1 ≤ w ≤ 100），表示西瓜的重量。"],
    outputZh: ["如果可以分成两块正偶数重量的部分，输出 YES；否则输出 NO。"],
    examples: [{ input: "8", output: "YES" }],
    noteZh: ["当 w=8 时，可以分成 2+6，也可以分成 4+4。"],
  },
  "71a": {
    titleZh: "过长的单词",
    timeLimitSeconds: 1,
    memoryLimitMb: 256,
    descriptionZh: [
      "长度严格大于 10 的单词称为过长单词。过长单词需要缩写：保留首字母和末字母，在二者之间写出被省略的字母数量。",
      "例如 localization 缩写为 l10n，internationalization 缩写为 i18n。长度不超过 10 的单词保持不变。",
    ],
    inputZh: ["第一行包含整数 n（1 ≤ n ≤ 100）。接下来 n 行每行一个仅由小写拉丁字母组成的单词，长度为 1 到 100。"],
    outputZh: ["输出 n 行，第 i 行为第 i 个单词按上述规则处理后的结果。"],
    examples: [{ input: "4\nword\nlocalization\ninternationalization\npneumonoultramicroscopicsilicovolcanoconiosis", output: "word\nl10n\ni18n\np43s" }],
  },
  "158a": {
    titleZh: "晋级下一轮",
    timeLimitSeconds: 3,
    memoryLimitMb: 256,
    descriptionZh: ["分数为正，并且分数不低于第 k 名选手分数的参赛者可以晋级下一轮。已知 n 名选手按名次排列的分数，请计算晋级人数。"],
    inputZh: [
      "第一行包含整数 n 和 k（1 ≤ k ≤ n ≤ 50）。",
      "第二行包含 n 个整数 a₁…aₙ（0 ≤ aᵢ ≤ 100），表示第 i 名的分数。序列保证非递增。",
    ],
    outputZh: ["输出能够晋级下一轮的参赛者数量。"],
    examples: [
      { input: "8 5\n10 9 8 7 7 7 5 5", output: "6" },
      { input: "4 2\n0 0 0 0", output: "0" },
    ],
    noteZh: ["第一个样例中第 5 名得 7 分，第 6 名也得 7 分，因此共有 6 人晋级。第二个样例中所有分数都不是正数。"],
  },
  "231a": {
    titleZh: "团队",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: ["Petya、Vasya 和 Tonya 组成了一支队伍。对于一道题，只有当至少两个人确信会做时，他们才会实现这道题。请统计他们最终会实现多少道题。"],
    inputZh: [
      "第一行包含整数 n（1 ≤ n ≤ 1000），表示题目数量。",
      "接下来 n 行每行三个 0 或 1，依次表示 Petya、Vasya、Tonya 是否确信会解决该题。",
    ],
    outputZh: ["输出队伍决定实现的题目数量。"],
    examples: [
      { input: "3\n1 1 0\n1 1 1\n1 0 0", output: "2" },
      { input: "2\n1 0 0\n0 1 1", output: "1" },
    ],
  },
  "263a": {
    titleZh: "漂亮矩阵",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: [
      "给定一个 5×5 矩阵，其中有 24 个 0 和一个 1。一次操作可以交换两行相邻的行，或者交换两列相邻的列。",
      "当唯一的 1 位于第 3 行第 3 列时，矩阵是漂亮的。求把矩阵变漂亮所需的最少操作次数。",
    ],
    inputZh: ["输入共 5 行，每行 5 个整数。保证矩阵中恰有一个 1，其余元素均为 0。"],
    outputZh: ["输出最少操作次数。"],
    examples: [
      { input: "0 0 0 0 0\n0 0 0 0 1\n0 0 0 0 0\n0 0 0 0 0\n0 0 0 0 0", output: "3" },
      { input: "0 0 0 0 0\n0 0 0 0 0\n0 1 0 0 0\n0 0 0 0 0\n0 0 0 0 0", output: "1" },
    ],
  },
  "266a": {
    titleZh: "桌上的石头",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: ["桌上从左到右排着 n 块石头，每块石头为红色、绿色或蓝色。请移除尽可能少的石头，使剩下的任意两块相邻石头颜色不同。"],
    inputZh: ["第一行包含整数 n（1 ≤ n ≤ 50）。第二行包含长度为 n 的字符串 s，其中字符 R、G、B 分别表示红、绿、蓝。"],
    outputZh: ["输出至少需要移除的石头数量。"],
    examples: [
      { input: "3\nRRG", output: "1" },
      { input: "5\nRRRRR", output: "4" },
      { input: "4\nBRBG", output: "0" },
    ],
  },
  "282a": {
    titleZh: "Bit++",
    timeLimitSeconds: 1,
    memoryLimitMb: 256,
    descriptionZh: [
      "Bit++ 语言只有一个变量 x 和两种操作：++ 使 x 增加 1，-- 使 x 减少 1。每条语句由一个操作和变量 X 组成，且没有空格；操作可以写在 X 前面或后面。",
      "x 的初始值为 0。执行给定程序中的全部语句，求 x 的最终值。",
    ],
    inputZh: ["第一行包含整数 n（1 ≤ n ≤ 150），表示语句数量。接下来 n 行每行一条合法语句。"],
    outputZh: ["输出 x 的最终值。"],
    examples: [
      { input: "1\n++X", output: "1" },
      { input: "2\nX++\n--X", output: "0" },
    ],
  },
  "339a": {
    titleZh: "有用的数学",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: ["Xenia 只会计算加数按非递减顺序排列的加法式。给定一个只包含数字 1、2、3 和加号的正确算式，请重新排列加数，使其按非递减顺序出现。"],
    inputZh: ["输入一个非空字符串 s，长度不超过 100，不含空格，仅由数字 1、2、3 和字符 + 组成。"],
    outputZh: ["输出重新排列后的算式。"],
    examples: [
      { input: "3+2+1", output: "1+2+3" },
      { input: "1+1+3+1+3", output: "1+1+1+3+3" },
      { input: "2", output: "2" },
    ],
  },
  "546a": {
    titleZh: "士兵与香蕉",
    timeLimitSeconds: 1,
    memoryLimitMb: 256,
    descriptionZh: ["一名士兵要买 w 根香蕉。第 1 根价格为 k，第 2 根为 2k，依此类推，第 i 根价格为 i·k。士兵现在有 n 元，求还需要向朋友借多少钱。"],
    inputZh: ["一行包含三个整数 k、n、w（1 ≤ k,w ≤ 1000，0 ≤ n ≤ 10⁹），分别为第一根香蕉的价格、士兵现有的钱和购买数量。"],
    outputZh: ["输出需要借的钱。如果现有金额足够，输出 0。"],
    examples: [{ input: "3 17 4", output: "13" }],
  },
  "977a": {
    titleZh: "错误减法",
    timeLimitSeconds: 1,
    memoryLimitMb: 256,
    descriptionZh: [
      "Vanya 对一个整数执行一种“错误减法”：如果当前数的最后一位不是 0，就把它减 1；否则把它除以 10。",
      "给定整数 n，连续执行 k 次这种操作，求最终结果。",
    ],
    inputZh: ["一行包含两个整数 n 和 k（2 ≤ n ≤ 10⁹，1 ≤ k ≤ 50）。保证执行过程中得到的结果始终为正数。"],
    outputZh: ["输出执行 k 次操作后的 n。"],
    examples: [
      { input: "512 4", output: "50" },
      { input: "1000000000 9", output: "1" },
    ],
  },
  "580a": {
    titleZh: "Kefa 的第一步",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: ["Kefa 连续经营 n 天，第 i 天赚到 aᵢ 元。求序列 a 中最长连续非递减子段的长度。连续子段指原序列中的连续片段。"],
    inputZh: ["第一行包含整数 n（1 ≤ n ≤ 10⁵）。第二行包含 n 个整数 a₁…aₙ（1 ≤ aᵢ ≤ 10⁹）。"],
    outputZh: ["输出最长连续非递减子段的长度。"],
    examples: [
      { input: "6\n2 2 1 3 4 1", output: "3" },
      { input: "3\n2 2 9", output: "3" },
    ],
    noteZh: ["第一个样例的一个最长子段是第 3 到第 5 个数：1,3,4。"],
  },
  "230a": {
    titleZh: "巨龙",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: [
      "Kirito 初始力量为 s，需要击败 n 条巨龙。他可以按任意顺序挑战。若当前力量不大于巨龙力量 xᵢ，他会失败；若当前力量严格大于 xᵢ，他会获胜并增加 yᵢ 点力量。",
      "判断 Kirito 能否在不失败的情况下击败全部巨龙。",
    ],
    inputZh: ["第一行包含 s 和 n（1 ≤ s ≤ 10⁴，1 ≤ n ≤ 10³）。接下来 n 行每行包含 xᵢ、yᵢ（1 ≤ xᵢ ≤ 10⁴，0 ≤ yᵢ ≤ 10⁴）。"],
    outputZh: ["如果能够击败全部巨龙，输出 YES；否则输出 NO。"],
    examples: [
      { input: "2 2\n1 99\n100 0", output: "YES" },
      { input: "10 1\n100 100", output: "NO" },
    ],
  },
  "706b": {
    titleZh: "有趣的饮料",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: ["城市中有 n 家商店出售同一种饮料，第 i 家商店的一瓶售价为 xᵢ。接下来 q 天，第 i 天 Vasiliy 有 mᵢ 枚硬币。对每一天，求有多少家不同商店的售价不超过当天预算。"],
    inputZh: [
      "第一行包含 n（1 ≤ n ≤ 100000）。第二行包含 n 个价格 xᵢ（1 ≤ xᵢ ≤ 100000）。",
      "第三行包含 q（1 ≤ q ≤ 100000）。接下来 q 行每行包含一个预算 mᵢ（1 ≤ mᵢ ≤ 10⁹）。",
    ],
    outputZh: ["输出 q 行，第 i 行为第 i 天可以买到饮料的商店数量。"],
    examples: [{ input: "5\n3 10 8 6 11\n4\n1\n10\n3\n11", output: "0\n4\n1\n5" }],
  },
  "1472d": {
    titleZh: "奇偶游戏",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: [
      "Alice 和 Bob 用一个含 n 个整数的数组进行游戏。两人轮流删除任意一个元素，Alice 先手。",
      "Alice 删除偶数时获得该数对应的分数，删除奇数不得分；Bob 删除奇数时获得该数对应的分数，删除偶数不得分。数组为空时游戏结束，分数更高者获胜。",
      "两人都采用最优策略，判断最终结果。数组中可能有重复元素。",
    ],
    inputZh: [
      "第一行包含测试用例数 t（1 ≤ t ≤ 10⁴）。",
      "每个测试用例第一行包含 n（1 ≤ n ≤ 2·10⁵），第二行包含 n 个整数 aᵢ（1 ≤ aᵢ ≤ 10⁹）。所有测试用例的 n 之和不超过 2·10⁵。",
    ],
    outputZh: ["每个测试用例输出一行：Alice 获胜输出 Alice，Bob 获胜输出 Bob，平局输出 Tie。"],
    examples: [{ input: "4\n4\n5 2 7 3\n3\n3 2 1\n4\n2 2 2 2\n2\n7 8", output: "Bob\nTie\nAlice\nAlice" }],
  },
  "1367c": {
    titleZh: "社交距离",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: [
      "餐厅有 n 张桌子排成一行，字符串 s 中 1 表示已有人，0 表示空桌。任意两张已占用桌子的编号差必须严格大于 k。给定的初始状态保证合法。",
      "求最多还能把多少个 0 改为 1，同时继续满足任意两个 1 的距离严格大于 k。",
    ],
    inputZh: [
      "第一行包含测试用例数 t（1 ≤ t ≤ 10⁴）。",
      "每个测试用例第一行包含 n、k（1 ≤ k ≤ n ≤ 2·10⁵），第二行包含长度为 n 的二进制字符串 s。所有测试用例的 n 之和不超过 2·10⁵。",
    ],
    outputZh: ["对每个测试用例输出最多可以新增占用的桌子数量。"],
    examples: [{ input: "6\n6 1\n100010\n6 2\n000000\n5 1\n10101\n3 1\n001\n2 2\n00\n1 1\n0", output: "1\n2\n0\n1\n1\n1" }],
    noteZh: ["第一个样例只能占用位置 3；第二个样例可以占用位置 1 和 6。"],
  },
  "1669h": {
    titleZh: "最大按位与",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: [
      "给定长度为 n 的数组 a 和非负整数 k。一次操作可以选择下标 i 和位 j（0 ≤ j ≤ 30），把 aᵢ 的第 j 位设为 1，也就是令 aᵢ ← aᵢ OR 2ʲ。",
      "最多执行 k 次操作，求 a₁ AND a₂ AND … AND aₙ 的最大可能值。",
    ],
    inputZh: [
      "第一行包含测试用例数 t（1 ≤ t ≤ 100）。",
      "每个测试用例第一行包含 n、k（1 ≤ n ≤ 2·10⁵，0 ≤ k ≤ 10⁹），第二行包含 n 个整数 aᵢ（0 ≤ aᵢ < 2³¹）。所有测试用例的 n 之和不超过 2·10⁵。",
    ],
    outputZh: ["对每个测试用例输出最多 k 次操作后，整个数组按位与的最大值。"],
    examples: [{ input: "4\n3 2\n2 1 1\n7 0\n4 6 6 28 6 6 12\n1 30\n0\n4 4\n3 1 3 1", output: "2\n4\n2147483646\n1073741825" }],
    noteZh: ["第一个样例可用两次操作把后两个元素的第 1 位设为 1，数组变为 [2,3,3]，按位与为 2。"],
  },
  "1967b1": {
    titleZh: "反转卡牌（简单版）",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: [
      "给定两个正整数 n、m，统计满足下列条件的有序数对 (a,b)：1 ≤ a ≤ n，1 ≤ b ≤ m；并且 a+b 是 b·gcd(a,b) 的倍数。",
      "本题为简单版。",
    ],
    inputZh: [
      "第一行包含测试用例数 t（1 ≤ t ≤ 10⁴）。",
      "每个测试用例包含 n、m（1 ≤ n,m ≤ 2·10⁶）。所有测试用例中 n 的总和与 m 的总和都不超过 2·10⁶。",
    ],
    outputZh: ["对每个测试用例输出满足条件的有序数对数量。"],
    examples: [{ input: "6\n1 1\n2 3\n3 5\n10 8\n100 1233\n1000000 1145141", output: "1\n3\n4\n14\n153\n1643498" }],
    noteZh: ["当 n=m=1 时只有 (1,1) 合法。"],
  },
  "1920c": {
    titleZh: "划分数组",
    timeLimitSeconds: 3,
    memoryLimitMb: 256,
    descriptionZh: [
      "对于 n 的每个正因数 k，把数组依次划分为 n/k 个长度为 k 的连续子数组。",
      "如果存在某个整数 m≥2，使数组中每个元素都替换为除以 m 的余数后，所有长度为 k 的子数组完全相同，那么这个 k 可以获得 1 分。求总得分。",
    ],
    inputZh: [
      "第一行包含测试用例数 t（1 ≤ t ≤ 10⁴）。",
      "每个测试用例第一行包含 n（1 ≤ n ≤ 2·10⁵），第二行包含 n 个整数 aᵢ（1 ≤ aᵢ ≤ n）。所有测试用例的 n 之和不超过 2·10⁵。",
    ],
    outputZh: ["对每个测试用例输出能够得分的 k 的数量。"],
    examples: [{ input: "8\n4\n1 2 1 4\n3\n1 2 3\n5\n1 1 1 1 1\n6\n1 3 1 1 3 1\n6\n6 2 6 2 2 2\n6\n2 6 3 6 6 6\n10\n1 7 5 1 4 3 1 3 1 4\n1\n1", output: "2\n1\n2\n4\n4\n1\n2\n1" }],
    noteZh: ["第一个样例中 k=2 时可取 m=2，两段都变为 [1,0]；k=4 时只有一个子数组，因此也一定满足。"],
  },
  "1791f": {
    titleZh: "区间更新与单点查询",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: [
      "给定数组 a，需要处理两类操作：",
      "1 l r：对每个 l≤i≤r，把 aᵢ 更新为它的十进制数位和；2 x：输出当前的 aₓ。",
    ],
    inputZh: [
      "第一行包含测试用例数 t（1 ≤ t ≤ 1000）。",
      "每个测试用例第一行包含 n、q（1 ≤ n,q ≤ 2·10⁵），第二行包含 n 个整数 aᵢ（1 ≤ aᵢ ≤ 10⁹），随后 q 行为上述两类操作。每个测试用例至少有一次第 2 类查询。",
      "所有测试用例的 n 之和、q 之和分别不超过 2·10⁵。",
    ],
    outputZh: ["按出现顺序输出所有第 2 类查询的答案。"],
    examples: [{ input: "3\n5 8\n1 420 69 1434 2023\n1 2 3\n2 2\n2 3\n2 4\n1 2 5\n2 1\n2 3\n2 5\n2 3\n9999 1000\n1 1 2\n2 1\n2 2\n1 1\n1\n2 1", output: "6\n15\n1434\n1\n6\n7\n36\n1\n1" }],
    noteZh: ["数位和操作可能反复作用；当一个数已经是一位数时，再操作也不会改变。"],
  },
  "1904c": {
    titleZh: "数组游戏",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: [
      "给定一个含 n 个正整数的数组。一次操作必须选择 1≤i<j≤|a|，把 |aᵢ-aⱼ| 追加到数组末尾。新加入的数也可以在后续操作中继续被选择。",
      "恰好执行 k 次操作后，最小化整个数组中的最小值，并输出这个最小可能值。",
    ],
    inputZh: [
      "第一行包含测试用例数 t（1 ≤ t ≤ 1000）。",
      "每个测试用例第一行包含 n、k（2 ≤ n ≤ 2·10³，1 ≤ k ≤ 10⁹），第二行包含 n 个整数 aᵢ（1 ≤ aᵢ ≤ 10¹⁸）。所有测试用例的 n² 之和不超过 4·10⁶。",
    ],
    outputZh: ["对每个测试用例输出恰好执行 k 次操作后，数组最小值的最小可能值。"],
    examples: [{ input: "4\n5 2\n3 9 7 15 1\n4 3\n7 4 15 12\n6 2\n42 47 50 54 62 79\n2 1\n500000000000000000 1000000000000000000", output: "1\n0\n3\n500000000000000000" }],
    noteZh: ["第二个样例可先后追加两个相同的差值 3，再用这两个 3 产生 0，因此最终最小值可以为 0。"],
  },
  "2176c": {
    titleZh: "奇数过程",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    descriptionZh: [
      "你有 n 枚硬币，面值为 a₁,a₂,…,aₙ，以及一个正整数 k。袋子初始为空。你必须恰好执行 k 次操作；每次从尚未使用的硬币中选择一枚放入袋子，该硬币之后不能再次选择。",
      "你有一只喜欢偶数的猫：每当袋中硬币面值之和变成偶数时，猫会立即清空袋子。清空会发生在加入硬币的过程中每一次和变成偶数时，而不只是最后一步。",
      "最终得分为操作结束后袋中硬币面值之和。对于所有 1≤k≤n，分别求能够得到的最大最终得分。",
    ],
    inputZh: [
      "第一行包含测试用例数 t（1 ≤ t ≤ 10⁴）。",
      "每个测试用例第一行包含 n（1 ≤ n ≤ 2·10⁵），第二行包含 n 个正整数 aᵢ（1 ≤ aᵢ ≤ 10⁹）。所有测试用例的 n 之和不超过 2·10⁵。",
    ],
    outputZh: ["对每个测试用例输出 n 个数，第 k 个数表示恰好执行 k 次操作时的最大可能最终得分。"],
    examples: [{ input: "6\n3\n1 1 1\n3\n1 2 3\n5\n4 1 3 1 2\n5\n4 2 3 1 3\n3\n4 1 2\n3\n4 2 2", output: "1 0 1\n3 5 0\n3 7 9 7 9\n3 7 9 7 9\n1 5 7\n0 0 0" }],
    noteZh: [
      "第一组数据 [1,1,1]：k=1 时得分为 1；k=2 时加入第二枚硬币后总和变成 2，袋子被清空，得分为 0；k=3 时前两枚触发清空，第三枚留下，得分为 1。",
      "第二组数据 [1,2,3]：k=2 时可以先放入 3，再放入 2，袋中和为 5，最大得分为 5；k=3 时所有硬币总和为偶数，最终袋子为空。",
    ],
  },
};

function normalizeProblemCode(code: string | undefined) {
  return (code ?? "").replace(/^CF\s*/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function findImportedStatement(code: string | undefined) {
  return statements[normalizeProblemCode(code)];
}

export const importedStatementCount = Object.keys(statements).length;
