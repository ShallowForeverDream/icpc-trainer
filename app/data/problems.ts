export type CuratedProblem = {
  code: string;
  contestId: number;
  index: string;
  title: string;
  titleZh: string;
  rating: number;
  tags: string[];
  summaryZh: string;
  inputZh: string;
  outputZh: string;
};

export const curatedProblems: CuratedProblem[] = [
  { code: "CF 4A", contestId: 4, index: "A", title: "Watermelon", titleZh: "西瓜", rating: 800, tags: ["数学", "入门"], summaryZh: "判断一个重量为 w 的西瓜能否被分成两块重量均为正偶数的部分。", inputZh: "输入一个整数 w，表示西瓜重量。", outputZh: "若可以按要求分割输出 YES，否则输出 NO。" },
  { code: "CF 71A", contestId: 71, index: "A", title: "Way Too Long Words", titleZh: "过长的单词", rating: 800, tags: ["字符串", "入门"], summaryZh: "长度超过 10 的单词需要缩写为首字母、中间字符数量和末字母。", inputZh: "第一行是单词数量，随后每行一个仅含小写字母的单词。", outputZh: "逐行输出原单词或按规则生成的缩写。" },
  { code: "CF 158A", contestId: 158, index: "A", title: "Next Round", titleZh: "晋级下一轮", rating: 800, tags: ["排序", "模拟"], summaryZh: "分数为正且不低于第 k 名分数的参赛者可以晋级，计算晋级人数。", inputZh: "给出参赛人数 n、名次 k，以及按非递增顺序排列的分数。", outputZh: "输出能够晋级下一轮的参赛者数量。" },
  { code: "CF 231A", contestId: 231, index: "A", title: "Team", titleZh: "团队", rating: 800, tags: ["计数", "入门"], summaryZh: "三名队员中至少两人确信会做的题目，团队才决定实现。统计最终会做多少题。", inputZh: "给出题目数，随后每行三个 0/1，表示三名队员是否确信会做。", outputZh: "输出团队决定实现的题目数量。" },
  { code: "CF 263A", contestId: 263, index: "A", title: "Beautiful Matrix", titleZh: "漂亮矩阵", rating: 800, tags: ["曼哈顿距离", "模拟"], summaryZh: "在 5×5 的 0/1 矩阵中，通过交换相邻行或列，把唯一的 1 移到中心。", inputZh: "输入一个 5×5 矩阵，其中恰好有一个元素为 1。", outputZh: "输出把 1 移到中心位置所需的最少交换次数。" },
  { code: "CF 266A", contestId: 266, index: "A", title: "Stones on the Table", titleZh: "桌上的石头", rating: 800, tags: ["字符串", "贪心"], summaryZh: "移除尽可能少的石头，使相邻石头颜色都不同。", inputZh: "输入石头数量 n 和一个由 R、G、B 组成的颜色字符串。", outputZh: "输出至少需要移除的石头数量。" },
  { code: "CF 282A", contestId: 282, index: "A", title: "Bit++", titleZh: "Bit++", rating: 800, tags: ["模拟", "入门"], summaryZh: "变量 x 初始为 0，按顺序执行若干自增或自减语句。", inputZh: "给出语句数量，随后每行是 ++X、X++、--X 或 X--。", outputZh: "输出所有语句执行完毕后 x 的值。" },
  { code: "CF 339A", contestId: 339, index: "A", title: "Helpful Maths", titleZh: "有用的数学", rating: 800, tags: ["字符串", "排序"], summaryZh: "把只包含 1、2、3 和加号的算式重新排列为非递减顺序。", inputZh: "输入一个形如 3+2+1 的算式字符串。", outputZh: "输出各加数按非递减顺序排列后的算式。" },
  { code: "CF 546A", contestId: 546, index: "A", title: "Soldier and Bananas", titleZh: "士兵与香蕉", rating: 800, tags: ["数学", "模拟"], summaryZh: "第 i 根香蕉价格为 i·k，计算买 n 根香蕉时还需要向朋友借多少钱。", inputZh: "输入首根香蕉单价 k、士兵现有金额 w 和购买数量 n。", outputZh: "输出需要借的钱；若现有金额足够则输出 0。" },
  { code: "CF 977A", contestId: 977, index: "A", title: "Wrong Subtraction", titleZh: "错误减法", rating: 800, tags: ["模拟", "数位"], summaryZh: "重复 k 次特殊减法：末位非零就减一，否则除以十。", inputZh: "输入整数 n 与操作次数 k。", outputZh: "输出执行 k 次操作后的 n。" },
  { code: "CF 580A", contestId: 580, index: "A", title: "Kefa and First Steps", titleZh: "Kefa 的第一步", rating: 900, tags: ["数组", "双指针"], summaryZh: "求序列中最长的连续非递减子段长度。", inputZh: "输入序列长度 n 和 n 个整数。", outputZh: "输出最长连续非递减子段的长度。" },
  { code: "CF 230A", contestId: 230, index: "A", title: "Dragons", titleZh: "巨龙", rating: 1000, tags: ["贪心", "排序"], summaryZh: "按合适顺序挑战巨龙；只有当前力量严格大于巨龙力量才能获胜并获得奖励。", inputZh: "输入初始力量、巨龙数量，以及每条巨龙的力量和奖励。", outputZh: "若能击败全部巨龙输出 YES，否则输出 NO。" },
  { code: "CF 706B", contestId: 706, index: "B", title: "Interesting drink", titleZh: "有趣的饮料", rating: 1100, tags: ["二分", "排序"], summaryZh: "对每个预算查询，统计价格不超过该预算的商店数量。", inputZh: "给出商店价格列表和若干天的预算查询。", outputZh: "对每个预算输出可以买到饮料的商店数量。" },
  { code: "CF 1472D", contestId: 1472, index: "D", title: "Even-Odd Game", titleZh: "奇偶游戏", rating: 1200, tags: ["博弈", "贪心"], summaryZh: "Alice 与 Bob 轮流取数；Alice 只从偶数得分，Bob 只从奇数得分，双方最优行动。", inputZh: "输入多组测试，每组给出数组长度和数组。", outputZh: "输出赢家 Alice、Bob 或平局 Tie。" },
  { code: "CF 1367C", contestId: 1367, index: "C", title: "Social Distance", titleZh: "社交距离", rating: 1300, tags: ["贪心", "字符串"], summaryZh: "在二进制座位串中放置尽量多的新乘客，并保证任意两个 1 的距离大于 k。", inputZh: "输入多组测试，每组给出 n、k 和一个二进制字符串。", outputZh: "输出最多还能放置多少个 1。" },
  { code: "CF 1669H", contestId: 1669, index: "H", title: "Maximal AND", titleZh: "最大按位与", rating: 1300, tags: ["位运算", "贪心"], summaryZh: "最多进行 k 次操作，把某个数的某一位设为 1，使全体元素按位与结果最大。", inputZh: "输入多组测试，每组给出 n、k 和 n 个整数。", outputZh: "输出最多 k 次操作后能得到的最大按位与。" },
  { code: "CF 1967B1", contestId: 1967, index: "B1", title: "Reverse Card (Easy Version)", titleZh: "反转卡牌（简单版）", rating: 1400, tags: ["数论", "观察"], summaryZh: "统计满足特定整除关系的有序整数对；简单版的数据范围允许直接枚举关键参数。", inputZh: "输入多组测试，每组给出两个整数 n 与 m。", outputZh: "对每组测试输出满足条件的整数对数量。" },
  { code: "CF 1920C", contestId: 1920, index: "C", title: "Partitioning the Array", titleZh: "划分数组", rating: 1600, tags: ["数学", "枚举"], summaryZh: "枚举分块长度，判断相同块内对应位置差值的最大公约数是否允许形成有效划分。", inputZh: "输入多组测试，每组给出数组长度和数组。", outputZh: "输出满足条件的分块方案数量。" },
  { code: "CF 1791F", contestId: 1791, index: "F", title: "Range Update Point Query", titleZh: "区间更新与单点查询", rating: 1600, tags: ["数据结构", "并查集"], summaryZh: "区间更新把每个数替换为其数位和，单点查询当前值；已经稳定为一位数的位置可跳过。", inputZh: "输入多组测试，每组给出数组和区间更新/单点查询操作。", outputZh: "对每个单点查询输出当前位置的当前值。" },
  { code: "CF 1904C", contestId: 1904, index: "C", title: "Array Game", titleZh: "数组游戏", rating: 1400, tags: ["贪心", "数学", "思维"], summaryZh: "每次可把两个已有元素差的绝对值加入数组，在恰好 k 次操作后最小化数组最小值。", inputZh: "输入多组测试。每组给出 n、k 和 n 个正整数，其中 1≤k≤3。", outputZh: "对每组测试输出完成恰好 k 次操作后数组最小值的最小可能值。" },
];

export function findCuratedProblem(code: string | undefined) {
  return curatedProblems.find((problem) => problem.code.replace(" ", "").toLowerCase() === (code ?? "").replace(" ", "").toLowerCase());
}
