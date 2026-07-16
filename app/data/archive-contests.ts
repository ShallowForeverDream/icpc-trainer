export type ArchiveContest = {
  id: string;
  year: 2022 | 2023 | 2024 | 2025 | 2026;
  name: string;
  city: string;
  type: "邀请赛" | "省赛" | "区域赛" | "国际区域赛" | "东亚决赛";
  boardPath?: string;
  boardSource?: "xcpcio" | "codeforces";
  problemCount: number;
  gymId?: number;
  codeforcesContestId?: number;
  qojContestId?: number;
  qojProblemIds?: number[];
  luoguContestId?: number;
  luoguProblemIds?: string[];
  problemTitles?: string[];
  staticStatements?: "official-chinese" | "translated-chinese";
  chineseStatementUrl?: string;
};

export const archiveContests: ArchiveContest[] = [
  {
    id: "2026-shenzhen-invitational", year: 2026, name: "ICPC 深圳全国邀请赛", city: "深圳", type: "邀请赛", boardPath: "icpc/51st/shenzhen-invitational", problemCount: 13, staticStatements: "official-chinese",
    qojContestId: 3588,
    qojProblemIds: [17753, 17754, 17755, 17756, 17757, 17758, 17759, 17760, 17761, 17762, 17763, 17764, 17765],
    problemTitles: ["Greetings from Prof. Chen", "All-Star Showdown", "One Item Away", "City Management", "Card Checking", "Astra", "Snake", "Telepathy", "Calendar Cubes", "Crossroads", "Sum and Product", "Critical Strike", "Night at the Museum"],
    chineseStatementUrl: "https://sua.ac/wiki/2026-icpc-invitational-shenzhen/contest-zh.pdf",
  },
  {
    id: "2026-wuhan-invitational", year: 2026, name: "ICPC 武汉全国邀请赛暨湖北省赛", city: "武汉", type: "邀请赛", boardPath: "icpc/51st/wuhan-invitational", problemCount: 13,
    qojContestId: 3799,
    qojProblemIds: [18428, 18429, 18430, 18431, 18432, 18433, 18434, 18435, 18436, 18437, 18438, 18439, 18440],
    problemTitles: ["Sort", "Sequence Operations", "Believe in You", "Prime Game", "Rook", "Lottery", "I Will Always Remember You", "Rectangle Cutting", "Nailoong vs. Bombloong 2", "The Best Card", "Deletion Game", "String Matching", "Iroha and the Kingdom of Construction"],
    staticStatements: "official-chinese",
    chineseStatementUrl: "https://contest.ucup.ac/download.php?type=attachments&id=3799&r=1",
  },
  { id: "2026-jiangxi-invitational", year: 2026, name: "CCPC 南昌全国邀请赛暨江西省赛", city: "南昌", type: "邀请赛", boardPath: "ccpc/12th/nanchang-invitational", problemCount: 13, gymId: 106554 },
  {
    id: "2026-shandong-provincial", year: 2026, name: "ICPC 山东省大学生程序设计竞赛", city: "山东", type: "省赛", boardPath: "provincial-contest/2026/shandong", problemCount: 13,
    qojContestId: 3767,
    qojProblemIds: [18307, 18308, 18309, 18310, 18311, 18312, 18313, 18314, 18315, 18316, 18317, 18318, 18319],
    problemTitles: ["Klotski", "Dictionary 2", "Meeting Schedule", "Largest Digit 2", "Simple Constructive Problem", "Gifts in Place", "Vampire Crawlers", "Puzzle", "Version Number", "Making Pine Branches", "Minimum Spanning Tree", "Fraction Iteration", "Night at the Museum 2"],
  },
  {
    id: "2026-apac-championship", year: 2026, name: "ICPC 亚洲太平洋锦标赛", city: "亚太赛区", type: "国际区域赛", boardSource: "codeforces", problemCount: 13, codeforcesContestId: 2206,
    problemTitles: ["Compare Suffixes", "Subtree Removal Game", "Upside Down Dijkstra", "Christmas Tree Un-decoration", "Parallel Sums", "Minesweeper String", "Extra Transition", "Reflect Sort", "Growth Factor", "Worldwide Playlist", "Time Display Stickers", "Onion", "Deformed Balance"],
  },

  { id: "2025-wuhan-invitational", year: 2025, name: "ICPC 武汉全国邀请赛暨湖北省赛", city: "武汉", type: "邀请赛", boardPath: "icpc/50th/wuhan-invitational", problemCount: 13, qojContestId: 2025, qojProblemIds: [10736, 10737, 10738, 10739, 10740, 10741, 10742, 10743, 10744, 10745, 10746, 10747, 10748] },
  { id: "2025-nanchang-invitational", year: 2025, name: "ICPC 南昌全国邀请赛暨江西省赛", city: "南昌", type: "邀请赛", boardPath: "icpc/50th/nanchang-invitational", problemCount: 13, gymId: 105911 },
  {
    id: "2025-shandong-provincial", year: 2025, name: "ICPC 山东省大学生程序设计竞赛", city: "山东", type: "省赛", boardPath: "provincial-contest/2025/shandong", problemCount: 13, gymId: 105930,
    qojContestId: 2040,
    qojProblemIds: [10486, 10487, 10488, 10489, 10490, 10491, 10492, 10493, 10494, 10495, 10496, 10497, 10498],
    problemTitles: ["Project Management", "Pinball", "Bracket Integer", "Distributed System", "Greatest Common Divisor", "ACE String", "Assembly Line", "Minimum Spanning Tree", "Square Puzzle", "Useful Algorithm", "Path Planning 2", "Stella", "Triangulation"],
  },
  { id: "2025-xian", year: 2025, name: "ICPC 区域赛西安站", city: "西安", type: "区域赛", boardPath: "icpc/50th/xian", problemCount: 13, qojContestId: 2562, qojProblemIds: [14681, 14682, 14683, 14684, 14685, 14686, 14687, 14688, 14689, 14690, 14691, 14692, 14693] },
  {
    id: "2025-chengdu", year: 2025, name: "ICPC 区域赛成都站", city: "成都", type: "区域赛", boardPath: "icpc/50th/chengdu", problemCount: 13, gymId: 106161, qojContestId: 2567,
    qojProblemIds: [14706, 14707, 14708, 14709, 14710, 14711, 14712, 14713, 14714, 14715, 14716, 14717, 14718],
    problemTitles: ["A Lot of Paintings", "Blood Memories", "Crossing River", "Deductive Snooker Scoring", "Escaping from Trap", "Following Arrows", "GCD of Subsets", "Heuristic Knapsack", "Inside Triangle", "Judging Papers", "K-Coverage", "Label Matching", "Meeting for Meals"],
  },
  { id: "2025-wuhan", year: 2025, name: "ICPC 区域赛武汉站", city: "武汉", type: "区域赛", boardPath: "icpc/50th/wuhan", problemCount: 13, qojContestId: 2609, qojProblemIds: [14719, 14720, 14721, 14722, 14723, 14724, 14725, 14726, 14727, 14728, 14729, 14730, 14731] },
  { id: "2025-nanjing", year: 2025, name: "ICPC 区域赛南京站", city: "南京", type: "区域赛", boardPath: "icpc/50th/nanjing", problemCount: 13, qojContestId: 2581, qojProblemIds: [14801, 14802, 14803, 14804, 14805, 14806, 14807, 14808, 14809, 14810, 14811, 14812, 14813] },
  {
    id: "2025-shenyang", year: 2025, name: "ICPC 区域赛沈阳站", city: "沈阳", type: "区域赛", boardPath: "icpc/50th/shenyang", problemCount: 13, gymId: 106252,
    qojContestId: 2641,
    qojProblemIds: [14940, 14941, 14942, 14943, 14944, 14945, 14946, 14947, 14948, 14949, 14950, 14951, 14952],
    problemTitles: ["Square Kingdom", "Buggy Painting Software I", "Buggy Painting Software II", "LED Display Renovation", "Play It by Ear", "The Bond Beyond Time", "Collision Damage", "Cute Young Diagram Counting", "Volunteer Simulator", "The Echoes of Chronos", "Relay Jump", "Leo", "The End?"],
    staticStatements: "official-chinese",
  },
  { id: "2025-shanghai", year: 2025, name: "ICPC 区域赛上海站", city: "上海", type: "区域赛", boardPath: "icpc/50th/shanghai", problemCount: 13, qojContestId: 2908, qojProblemIds: [15314, 15315, 15316, 15317, 15318, 15319, 15320, 15321, 15322, 15323, 15324, 15325, 15326] },
  {
    id: "2025-hongkong", year: 2025, name: "ICPC 区域赛香港站", city: "香港", type: "区域赛", boardPath: "icpc/50th/hongkong", problemCount: 12,
    qojContestId: 3169,
    qojProblemIds: [15432, 15433, 15434, 15435, 15436, 15437, 15438, 15439, 15440, 15441, 15442, 15443],
    problemTitles: ["Bipartite Graph Matching Problem", "Travelling", "Stonebag", "Dumb Problem", "Bipartite Graph Weighting Problem", "Find the Circuit", "Watering System", "Longest Common Prefix", "DFS Order - Extra Stage", "Re: Becoming the Programming Champion", "Cyclic Shift", "Cyclic Shift II"],
  },
  { id: "2025-ecfinal", year: 2025, name: "ICPC 东亚区决赛", city: "EC-Final", type: "东亚决赛", boardPath: "icpc/50th/ecfinal", problemCount: 12, qojContestId: 3295, qojProblemIds: [16328, 16329, 16330, 16331, 16332, 16333, 16334, 16335, 16336, 16337, 16338, 16339] },
  {
    id: "2025-bangkok", year: 2025, name: "ICPC 亚洲曼谷区域赛", city: "泰国 · 曼谷", type: "国际区域赛", boardSource: "codeforces", problemCount: 14, gymId: 106164,
    problemTitles: ["Among Us", "Bring It To Back", "Challenge to the Reader", "Dungeons and Dragons", "Elena and Travel Pass", "Festival Stroll", "Galactic Adventure Agency", "Home Workout Playlist", "ICPC Extractor", "Joyeuse", "Kickshot Tournament", "Laser", "Merticulous Manipulation", "No Distance is Too Far Apart"],
  },
  {
    id: "2025-taichung", year: 2025, name: "ICPC 亚洲台中区域赛", city: "中国台湾 · 台中", type: "国际区域赛", boardSource: "codeforces", problemCount: 14, codeforcesContestId: 2172,
    problemTitles: ["ASCII Art Contest", "Buses", "Circles Are Far from Each Other", "Divisor Card Game", "Number Maze", "Cluster Computing System", "Gene Editor", "Shuffling Cards with Problem Solver 68!", "Birthday", "Sliding Tiles", "Kindergarten Homework", "Maximum Color Segment", "Maximum Distance To Port", "New Kingdom"],
  },
  {
    id: "2025-apac-championship", year: 2025, name: "ICPC 亚洲太平洋锦标赛", city: "亚太赛区", type: "国际区域赛", boardSource: "codeforces", problemCount: 13, codeforcesContestId: 2073,
    problemTitles: ["Control Towers", "Three-Dimensional Embedding", "Cactus Connectivity", "Tower of Hanoi", "Minus Operator", "Hold the Star", "Corrupted File", "Secret Lilies and Roses", "Squares on Grid Lines", "Gathering Sharks", "Book Sorting", "Boarding Queue", "Can You Reach There?"],
  },
  {
    id: "2025-nerc-finals", year: 2025, name: "ICPC 北方欧亚赛区决赛（NERC）", city: "北方欧亚赛区", type: "国际区域赛", boardSource: "codeforces", problemCount: 13, codeforcesContestId: 2181,
    problemTitles: ["Alphabet City", "Battle of Arrays", "Cacti Classification", "Doorway", "Elevator Against Humanity", "Fragmented Nim", "Greta's Game", "Honey Cake", "Irrigation Interlock", "Jinx or Jackpot", "Knit the Grid", "LLM Training", "Medical Parity"],
  },
  {
    id: "2025-yokohama", year: 2025, name: "ICPC 亚洲横滨区域赛", city: "日本 · 横滨", type: "国际区域赛", boardSource: "codeforces", problemCount: 12, gymId: 106268,
    problemTitles: ["Tatami Renovation", "Minimizing Wildlife Damage", "Seagull Population", "Decompose and Concatenate", "Cutting Tofu", "Astral Geometry", "Charity Raffle", "U-Shaped Panels", "Game of Names", "ICPC Board", "Membership Structure of a Secret Society", "Common Tangent Lines"],
  },

  {
    id: "2024-xian-invitational", year: 2024, name: "ICPC 西安全国邀请赛", city: "西安", type: "邀请赛", boardPath: "icpc/49th/xian-invitational", problemCount: 13, staticStatements: "translated-chinese",
    luoguContestId: 173404,
    luoguProblemIds: ["P10553", "P10554", "P10555", "P10556", "P10557", "P10558", "P10559", "P10560", "P10561", "P10562", "P10563", "P10564", "P10565"],
    problemTitles: ["Guess The Tree", "Turn Off The Lights", "Fix the Tree", "Make Them Straight", "Dumb Robot", "XOR Game", "The Last Cumulonimbus Cloud", "Holes and Balls", "Smart Quality Inspector", "Triangle", "Yet Another Maximum Matching Counting Problem", "Rubbish Sorting", "Chained Lights"],
  },
  {
    id: "2024-kunming-invitational", year: 2024, name: "ICPC 昆明全国邀请赛", city: "昆明", type: "邀请赛", boardPath: "icpc/49th/kunming-invitational", problemCount: 13,
    qojContestId: 1802,
    qojProblemIds: [9422, 9423, 9424, 9425, 9426, 9427, 9428, 9429, 9430, 9431, 9432, 9433, 9434],
    problemTitles: ["Two-star Contest", "Gold Medal", "Stop the Castle 2", "Generated String", "Relearn through Review", "Collect the Coins", "Be Positive", "Subarray", "Left Shifting 2", "The Quest for El Dorado", "Permutation", "Trails", "Italian Cuisine"],
  },
  { id: "2024-wuhan-invitational", year: 2024, name: "ICPC 武汉全国邀请赛暨湖北省赛", city: "武汉", type: "邀请赛", boardPath: "icpc/49th/wuhan-invitational", problemCount: 13, gymId: 105143 },
  { id: "2024-nanjing", year: 2024, name: "ICPC 区域赛南京站", city: "南京", type: "区域赛", boardPath: "icpc/49th/nanjing", problemCount: 13, gymId: 105484 },
  { id: "2024-hangzhou", year: 2024, name: "ICPC 区域赛杭州站", city: "杭州", type: "区域赛", boardPath: "icpc/49th/hangzhou", problemCount: 13, gymId: 105657 },
  { id: "2024-chengdu", year: 2024, name: "ICPC 区域赛成都站", city: "成都", type: "区域赛", boardPath: "icpc/49th/chengdu", problemCount: 13, gymId: 105486 },
  {
    id: "2024-shenyang", year: 2024, name: "ICPC 区域赛沈阳站", city: "沈阳", type: "区域赛", boardPath: "icpc/49th/shenyang", problemCount: 13, gymId: 105578,
    qojContestId: 1865,
    qojProblemIds: [9798, 9799, 9800, 9801, 9802, 9803, 9804, 9805, 9806, 9807, 9808, 9809, 9810],
    problemTitles: ["Safety First", "Magical Palette", "Crisis Event: Meteorite", "Dot Product Game", "Light Up the Grid", "Light Up the Hypercube", "Guess the Polygon", "Guide Map", "Growing Tree", "Make Them Believe", "Fragile Pinball", "The Grand Contest", "Obliviate, Then Reincarnate"],
    staticStatements: "official-chinese",
  },
  { id: "2024-kunming", year: 2024, name: "ICPC 区域赛昆明站", city: "昆明", type: "区域赛", boardPath: "icpc/49th/kunming", problemCount: 13, gymId: 105588 },
  {
    id: "2024-shanghai", year: 2024, name: "ICPC 区域赛上海站", city: "上海", type: "区域赛", boardPath: "icpc/49th/shanghai", problemCount: 13,
    qojContestId: 1913,
    qojProblemIds: [9037, 9038, 9039, 9040, 9041, 9042, 9043, 9044, 9045, 9046, 9047, 9048, 9049],
    problemTitles: ["Ancient Maps, Hidden Danger", "Basic Graph Algorithm", "Conquer the Multiples", "Decrease and Swap", "Equal Measure", "Fast Bogosort", "Geometry Task", "Hexagon Puzzle", "In Search of the Ultimate Artifact", "Just-in-Time Render Analysis", "Knights of Night", "Lazy Susan", "Machine Learning with Penguins"],
  },
  {
    id: "2024-hongkong", year: 2024, name: "ICPC 区域赛香港站", city: "香港", type: "区域赛", boardPath: "icpc/49th/hongkong", problemCount: 13,
    qojContestId: 1885,
    qojProblemIds: [9915, 9916, 9917, 9918, 9919, 9920, 9921, 9922, 9923, 9924, 9925, 9926, 9927],
    problemTitles: ["General Symmetry", "Defeat the Enemies", "The Story of Emperor Bie", "Master of Both VI", "Concave Hull", "Money Game 2", "Yelkrab", "Mah-jong", "Ma Meilleure Ennemie", "Reconstruction", "LR String", "Flipping Paths", "Godzilla"],
  },
  {
    id: "2024-ecfinal", year: 2024, name: "ICPC 东亚区决赛", city: "EC-Final", type: "东亚决赛", boardPath: "icpc/49th/ecfinal", problemCount: 12,
    qojContestId: 1894,
    qojProblemIds: [9975, 9976, 9977, 9978, 9979, 9980, 9981, 9982, 9983, 9984, 9985, 9986],
    problemTitles: ["Hitoshizuku", "Guess the Polygon 2", "Norte da Universidade", "Keystone Correction", "Corrupted Scoreboard Log", "Boolean Function Reconstruction", "Collatz Conjecture", "Staircase Museum", "Color-Balanced Tree", "The Mysterious Shop", "Exploration Boundary", "Shiori"],
  },
  {
    id: "2024-taichung", year: 2024, name: "ICPC 亚洲台中区域赛", city: "中国台湾 · 台中", type: "国际区域赛", boardSource: "codeforces", problemCount: 14, codeforcesContestId: 2041,
    problemTitles: ["The Bento Box Adventure", "Bowling Frame", "Cube", "Drunken Maze", "Beautiful Array", "Segmentation Folds", "Grid Game", "Sheet Music", "Auto Complete", "Bottle Arrangement", "Trophic Balance Species", "Building Castle", "Selection Sort", "Railway Construction"],
  },
  {
    id: "2024-apac-championship", year: 2024, name: "ICPC 亚洲太平洋锦标赛", city: "亚太赛区", type: "国际区域赛", boardSource: "codeforces", problemCount: 13, codeforcesContestId: 1938,
    problemTitles: ["Antiparticle Antiphysics", "Attraction Score", "Bit Counting Sequence", "Bánh Bò", "Duplicates", "Forming Groups", "Personality Test", "Pho Restaurant", "Symmetric Boundary", "There and Back Again", "Tree Quiz", "XOR Operations", "Zig-zag"],
  },
  {
    id: "2024-nerc-finals", year: 2024, name: "ICPC 北方欧亚赛区决赛（NERC）", city: "北方欧亚赛区", type: "国际区域赛", boardSource: "codeforces", problemCount: 13, codeforcesContestId: 2052,
    problemTitles: ["Adrenaline Rush", "BitBitJump", "Cactus without Bridges", "DAG Serialization", "Expression Correction", "Fix Flooded Floor", "Geometric Balance", "Hunting Hoglins in Hogwarts", "Incompetent Delivery Guy", "Judicious Watching", "Knowns and Unknowns", "Legacy Screensaver", "Managing Cluster"],
  },
  {
    id: "2024-jakarta", year: 2024, name: "ICPC 亚洲雅加达区域赛", city: "印度尼西亚 · 雅加达", type: "国际区域赛", boardSource: "codeforces", problemCount: 13, codeforcesContestId: 2045,
    problemTitles: ["Scrambled Scrabble", "ICPC Square", "Saraga", "Aquatic Dragon", "Narrower Passageway", "Grid Game 3-angle", "X Aura", "Missing Separators", "Microwavable Subsequence", "Xorderable Array", "GCDDCG", "Buggy DFS", "Mirror Maze"],
  },
  {
    id: "2024-european-championship", year: 2024, name: "ICPC 欧洲锦标赛", city: "欧洲赛区", type: "国际区域赛", boardSource: "codeforces", problemCount: 11, codeforcesContestId: 1949,
    problemTitles: ["Grove", "Charming Meals", "Annual Ants' Gathering", "Funny or Scary?", "Damage per Second", "Dating", "Scooter", "Division Avoidance", "Disks", "Amanda the Amoeba", "Make Triangle"],
  },
  {
    id: "2024-yokohama", year: 2024, name: "ICPC 亚洲横滨区域赛", city: "日本 · 横滨", type: "国际区域赛", boardSource: "codeforces", problemCount: 12, gymId: 105633,
    problemTitles: ["Ribbon on the Christmas Present", "The Sparsest Number in Between", "Omnes Viae Yokohamam Ducunt?", "Tree Generators", "E-Circuit Is Now on Sale!", "The Farthest Point", "Beyond the Former Explorer", "Remodeling the Dungeon 2", "Greatest of the Greatest Common Divisors", "Mixing Solutions", "Scheduling Two Meetings", "Peculiar Protocol"],
  },

  {
    id: "2023-shenyang", year: 2023, name: "ICPC 区域赛沈阳站", city: "沈阳", type: "区域赛", boardPath: "icpc/48th/shenyang", problemCount: 13, gymId: 104869,
    qojContestId: 1449,
    qojProblemIds: [7777, 7778, 7779, 7780, 7781, 7782, 7783, 7784, 7785, 7786, 7787, 7788, 7789],
    problemTitles: ["Intro: Dawn of a New Era", "Turning Permutation", "Swiss Stage", "Dark LaTeX vs. Light LaTeX", "Sheep Eat Wolves", "Ursa Minor", "Military Maneuver", "Line Graph Sequence", "Three Rectangles", "Graft and Transplant", "Maximum Rating", "Rook Detection", "Outro: True Love Waits"],
  },
  {
    id: "2022-shenyang", year: 2022, name: "ICPC 区域赛沈阳站", city: "沈阳", type: "区域赛", boardPath: "icpc/47th/shenyang", problemCount: 13, gymId: 104160,
    qojContestId: 1096,
    qojProblemIds: [5433, 5434, 5435, 5436, 5437, 5438, 5439, 5440, 5441, 5442, 5443, 5444, 5445],
    problemTitles: ["Absolute Difference", "Binary Substrings", "Clamped Sequence", "DRX vs. T1", "Graph Completing", "Half Mixed", "Meet in the Middle", "P-P-Palindrome", "Quartz Collection", "Referee Without Red", "Security at Museums", "Tavern Chess", "Vulpecula"],
  },
];

export function findArchiveContest(id: string) {
  return archiveContests.find((contest) => contest.id === id);
}

export function archiveContestIntegrated(contest: ArchiveContest) {
  return Boolean(contest.gymId || contest.codeforcesContestId
    || (contest.qojContestId && contest.qojProblemIds?.length && contest.qojProblemIds.length >= contest.problemCount)
    || (contest.luoguContestId && contest.luoguProblemIds?.length && contest.luoguProblemIds.length >= contest.problemCount));
}

export function archiveProblemUrl(contest: ArchiveContest, slot: string) {
  if (contest.codeforcesContestId) return `https://codeforces.com/contest/${contest.codeforcesContestId}/problem/${slot}`;
  if (contest.gymId) return `https://codeforces.com/gym/${contest.gymId}/problem/${slot}`;
  const problemId = contest.qojProblemIds?.[slot.charCodeAt(0) - 65];
  if (contest.qojContestId && problemId) return `https://contest.ucup.ac/contest/${contest.qojContestId}/problem/${problemId}?v=1`;
  if (contest.qojContestId) return `https://qoj.ac/contest/${contest.qojContestId}`;
  const luoguProblemId = contest.luoguProblemIds?.[slot.charCodeAt(0) - 65];
  if (luoguProblemId) return `https://www.luogu.com.cn/problem/${luoguProblemId}`;
  if (contest.luoguContestId) return `https://www.luogu.com.cn/contest/${contest.luoguContestId}`;
  return contest.boardPath ? `https://board.xcpcio.com/${contest.boardPath}` : "/vp/archive";
}

export function archiveProblemHref(contest: ArchiveContest, slot: string) {
  const problemId = contest.qojProblemIds?.[slot.charCodeAt(0) - 65];
  if (contest.qojContestId && problemId) return `/vp/archive/problem?contest=${encodeURIComponent(contest.id)}&slot=${encodeURIComponent(slot)}`;
  const luoguProblemId = contest.luoguProblemIds?.[slot.charCodeAt(0) - 65];
  if (contest.luoguContestId && luoguProblemId) return `/vp/archive/problem?contest=${encodeURIComponent(contest.id)}&slot=${encodeURIComponent(slot)}`;
  const codeforcesId = contest.codeforcesContestId || contest.gymId;
  if (codeforcesId) return `/problem/${codeforcesId}${slot}?archive=${encodeURIComponent(contest.id)}&slot=${encodeURIComponent(slot)}`;
  return archiveProblemUrl(contest, slot);
}

export function archivePracticeProblem(contest: ArchiveContest, slot: string) {
  const index = slot.charCodeAt(0) - 65;
  const problemId = contest.qojProblemIds?.[index];
  if (contest.qojContestId && problemId) {
    const officialUrl = `https://contest.ucup.ac/contest/${contest.qojContestId}/problem/${problemId}?v=1`;
    return {
      judge: "ucup" as const,
      id: problemId,
      contestId: contest.qojContestId,
      slot,
      title: contest.problemTitles?.[index] || `Problem ${slot}`,
      officialUrl,
      statementUrl: `https://contest.ucup.ac/download.php?type=statement&id=${problemId}&contest_id=${contest.qojContestId}`,
      submitUrl: `${officialUrl}#tab-submit-answer`,
      chineseStatementUrl: contest.chineseStatementUrl,
    };
  }
  const luoguProblemId = contest.luoguProblemIds?.[index];
  if (contest.luoguContestId && luoguProblemId && /^P\d{4,8}$/.test(luoguProblemId)) {
    const officialUrl = `https://www.luogu.com.cn/problem/${luoguProblemId}`;
    return {
      judge: "luogu" as const,
      id: Number(luoguProblemId.slice(1)),
      contestId: contest.luoguContestId,
      luoguProblemId,
      slot,
      title: contest.problemTitles?.[index] || `Problem ${slot}`,
      officialUrl,
      statementUrl: officialUrl,
      submitUrl: officialUrl,
      chineseStatementUrl: undefined,
    };
  }
  return null;
}
