// data/chars.js —— 入门级 500 高频字表（按常见字频排序）
// 字段说明（PRD 6.1）：
//   char      字
//   pinyin    拼音（内部用，界面全程不展示）
//   explain   大白话口语讲解（禁用书面语）
//   mnemonic  记字诀（字谜/顺口溜）
//   words     组词 2-3 个
//   sentence  生活例句 1 句
//   hasStroke 是否有笔顺数据（有则 data/strokes/<字>.json 存在）
//
// 前 20 字为完整示范内容；其余 480 字为占位（讲解文案属内容生产工作，见 PRD 第 6 章）。
// 【未来替换为服务端 REST API】整个字表改由 CDN 课程包下发（GET {CDN}/course/v1/chars.json）。

// ===== 前 20 字：完整示范内容 =====
var FULL_CHARS = [
  {
    char: '的', pinyin: 'de',
    explain: '的，是用得最多的一个字。它像个小帮手，把前后两个词连起来，比如「我的家」「红的苹果」。',
    mnemonic: '一个白勺熬甜汤——白字加个勺，就是「的」。',
    words: ['我的', '好的', '你的'],
    sentence: '这是我的家。',
    hasStroke: true
  },
  {
    char: '一', pinyin: 'yī',
    explain: '一，就是一个、两只的「一」。一个苹果、一斤白菜，都用它。',
    mnemonic: '一根扁担躺下休息——一横就是「一」。',
    words: ['一个', '一天', '一斤'],
    sentence: '我一天学五个字。',
    hasStroke: true
  },
  {
    char: '是', pinyin: 'shì',
    explain: '是，就是对、没错的意思。人家问「这是你的药吗」，你说「是」。',
    mnemonic: '太阳底下立得正，是是非非分得清。',
    words: ['是的', '不是', '就是'],
    sentence: '这是我的药，一天吃两次。',
    hasStroke: true
  },
  {
    char: '了', pinyin: 'le',
    explain: '了，表示事情做完啦。饭吃了、觉醒了、药买了，后面都跟个「了」。',
    mnemonic: '横钩下面挂弯钩，事情做完就画「了」。',
    words: ['完了', '好了', '吃了'],
    sentence: '饭做好了，快来吃吧。',
    hasStroke: true
  },
  {
    char: '我', pinyin: 'wǒ',
    explain: '我，就是你自己。说话说到自己，就用「我」。',
    mnemonic: '找字丢了头上那一横，找来找去找到「我」。',
    words: ['我们', '我的', '我家'],
    sentence: '我今年六十五岁了。',
    hasStroke: true
  },
  {
    char: '人', pinyin: 'rén',
    explain: '人，就是你我他，两条腿走路的人。老人、大人、好人，都有它。',
    mnemonic: '一撇一捺两条腿，顶天立地一个「人」。',
    words: ['人们', '老人', '大人'],
    sentence: '早上公园里人很多。',
    hasStroke: true
  },
  {
    char: '在', pinyin: 'zài',
    explain: '在，就是待在某个地方。我在家、你在公园，都用「在」。',
    mnemonic: '有朋友又有土，人就「在」这儿住。',
    words: ['在家', '现在', '不在'],
    sentence: '我在菜市场买菜。',
    hasStroke: true
  },
  {
    char: '他', pinyin: 'tā',
    explain: '他，说的是另外那个人。说老伴、说儿子，都可以说「他」。',
    mnemonic: '「也」字旁边站个人，说的就是那个「他」。',
    words: ['他们', '他的', '他人'],
    sentence: '他是我的老伴。',
    hasStroke: true
  },
  {
    char: '有', pinyin: 'yǒu',
    explain: '有，就是手里有东西。有钱、有药、有饭吃，都是这个「有」。',
    mnemonic: '大手底下一块肉，吃穿不愁啥都「有」。',
    words: ['没有', '有钱', '有用'],
    sentence: '家里有两口人。',
    hasStroke: true
  },
  {
    char: '这', pinyin: 'zhè',
    explain: '这，就是手边这个、眼前这个。这个菜、这条路，离得近就用「这」。',
    mnemonic: '「文」字坐上小车跑，送到跟前就是「这」。',
    words: ['这个', '这里', '这样'],
    sentence: '这个苹果很甜。',
    hasStroke: true
  },
  {
    char: '个', pinyin: 'gè',
    explain: '个，是数数用的。一个西瓜、两个月、三个人，都少不了它。',
    mnemonic: '人字下面站根棍儿，数东西就用这个「个」。',
    words: ['一个', '个人', '个子'],
    sentence: '我买了一个大西瓜。',
    hasStroke: true
  },
  {
    char: '大', pinyin: 'dà',
    explain: '大，跟「小」相反。大西瓜、大碗、大风，都是这个「大」。',
    mnemonic: '「人」字张开两只手，抱住一个大西瓜。',
    words: ['大人', '大小', '大家'],
    sentence: '这个西瓜真大。',
    hasStroke: true
  },
  {
    char: '们', pinyin: 'men',
    explain: '们，跟在人后面，表示不止一个人。我们、他们、人们，都是它。',
    mnemonic: '一个人靠在门边等，人多了就成「们」。',
    words: ['我们', '他们', '人们'],
    sentence: '我们一起去公园。',
    hasStroke: true
  },
  {
    char: '来', pinyin: 'lái',
    explain: '来，就是往这边走、过来。来了、回来、快来，都用它。',
    mnemonic: '米字上面加一横，香喷喷的饭客人「来」。',
    words: ['来了', '出来', '回来'],
    sentence: '快来看电视，戏开演了。',
    hasStroke: true
  },
  {
    char: '上', pinyin: 'shàng',
    explain: '上，就是往高处去、在上头。上山、上车、早上，都是这个「上」。',
    mnemonic: '一竖站在横道上，一步一步往「上」爬。',
    words: ['上去', '早上', '上面'],
    sentence: '太阳上山了，天亮了。',
    hasStroke: true
  },
  {
    char: '到', pinyin: 'dào',
    explain: '到，就是到了地方。到站了、到家了、收到了，都是这个「到」。',
    mnemonic: '「至」字旁边立把刀，快刀一站就到「到」。',
    words: ['到了', '来到', '看到'],
    sentence: '车到终点站了，请下车。',
    hasStroke: true
  },
  {
    char: '时', pinyin: 'shí',
    explain: '时，就是时间的时。几点了、什么时候、一小时，都有它。',
    mnemonic: '日头旁边一寸光阴，一寸光阴一寸「时」。',
    words: ['时间', '小时', '时候'],
    sentence: '现在是什么时间了？',
    hasStroke: true
  },
  {
    char: '地', pinyin: 'dì',
    explain: '地，就是脚下踩的大地、种庄稼的地。地上、地里、地方，都用它。',
    mnemonic: '「土」字加个「也」，长出庄稼就是「地」。',
    words: ['地上', '土地', '地方'],
    sentence: '地上有积水，走路小心滑。',
    hasStroke: true
  },
  {
    char: '为', pinyin: 'wèi',
    explain: '为，就是为了、因为。为了身体好、因为下雨了，都用这个「为」。',
    mnemonic: '力气头上两点汗，「为」了一家出力气。',
    words: ['为了', '因为', '为什么'],
    sentence: '为了身体好，我每天走走路。',
    hasStroke: true
  },
  {
    char: '子', pinyin: 'zǐ',
    explain: '子，是孩子的子。桌子、椅子、日子、孙子，后面都爱带个「子」。',
    mnemonic: '「了」字添上一横，抱个娃娃就是「子」。',
    words: ['孩子', '桌子', '日子'],
    sentence: '孩子们都回来了，家里真热闹。',
    hasStroke: true
  },
  {
    char: '家', pinyin: 'jiā',
    explain: '家庭，住所。上面是“宀”（房屋），下面是“豕”（猪）。古代认为家里有猪，才算安居乐业。',
    mnemonic: '宝盖头下一个豕，有屋有猪才是「家」。',
    words: ['家庭', '回家', '家里'],
    sentence: '这里是温暖的家。',
    hasStroke: false
  }
];

// ===== 其余 480 字：按常见字频排序，内容待补充 =====
// （按 10 字一行排列，便于校对顺序）
var REST_CHARS = (
  '不中国说和你出道也年' +
  '得就那要下以生会自着' +
  '去过家学对可她里后小' +
  '么心多天而能好都然没' +
  '日于起还发成事只作当' +
  '想看文无开手十用主行' +
  '方又如前所本见经头容' +
  '公同三已老从动两长知' +
  '民样现分将外但身些与' +
  '高意进法此月儿世四因' +
  '音回点明由其直言二五' +
  '理者立名水定工情使代' +
  '度体内机加果何等部力' +
  '常女金光风白平安门车' +
  '向间关东西气很走元电' +
  '话口先思利次全食美应' +
  '山再万军语海北南新低' +
  '花房火土石田米牛羊马' +
  '鸟鱼虫草木叶茶酒油盐' +
  '酱醋糖蜜蛋豆面包饼粥' +
  '汤碗筷勺盘锅刀桌椅床' +
  '灯窗屋楼路街桥船站票' +
  '钱角块斤克尺寸号病药' +
  '医院痛疼咳血压胃肠肝' +
  '眼耳鼻牙脚腿腰背肩脖' +
  '爸妈爷奶哥姐弟妹孙夫' +
  '妻亲朋友邻居村镇县区' +
  '早晚夜午春夏秋冬今昨' +
  '星期买卖吃喝穿住跑跳' +
  '坐睡醒洗扫擦切煮炒烧' +
  '晾晒种收养喂读写听问' +
  '答教记忘认识字书报信' +
  '短视唱歌舞打牌棋钓游' +
  '旅逛菜超商店银邮局园' +
  '场广红绿黄蓝黑雪色颜' +
  '旧少男壮矮胖瘦远近快' +
  '慢轻重干湿香臭甜苦辣' +
  '酸咸淡坏错真假难易贵' +
  '便宜稳危急缓喜怒哀乐' +
  '爱恨怕愁笑哭谢请始停' +
  '止帮送拿放找给借接带' +
  '推拉入左右边旁顶底满' +
  '空半双单各每另别整够' +
  '才刚曾或且虽极挺怪蛮' +
  '六七八九百千零第支把' +
  '张条件套瓶袋盒节岁课' +
  '遍趟阵刻秒番顿席员遭' +
  '办抱抬搬剪梳刷吹戴脱'
).split('');

var chars = FULL_CHARS.concat(REST_CHARS.map(function (ch) {
  return {
    char: ch,
    pinyin: '',
    explain: '内容待补充',
    mnemonic: '内容待补充',
    words: ['内容待补充'],
    sentence: '内容待补充',
    hasStroke: false
  };
}));

module.exports = chars;
