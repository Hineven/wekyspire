# 故事模式 Cutscene 剧本

以引擎契约书写（`{ id, steps }`，步骤词汇：`fade` / `wipe` / `image` / `dialogue` / `call`），
可整段拷入 `src/shell/overlay/scripts.js`。`call` 步骤的 `fn` 为装配层绑定的副作用占位（字符串标记）。
口径见 README.md：**反直抒**——文字不直接抒情，情绪由对话留白 + `> 幕间｜`动态 + `> 音乐｜`节奏三条通道侧写；
骑士头盔遮面，全程不写其表情神态；骑士冷峻、寡言、口语化——像普通人说话（"很难吃。""不。"），
不警句不说教、不主动挖苦，可说可不说的话不说（沉默写作 `骑士：...`）；
remi 天真笨拙执着、情绪外露，称呼骑士为「骑士」。CG `src` 均为占位名。

触发总览（与 string.md 三结局结构对齐）：

- `opening` 开场（新档）
- `chapter2/3/4` 章节开场（12 / 23 / 34 层）
- `boss11/22/33` 前后置（44 层的塔顶剧情单列）
- `firstDeath` 死亡→重置→remi抱遗物（首次死亡）
- `towerTop` 塔顶（44 层控制室：字条 → 钥匙 → 关停 → 塔楼程序现身 → 最终战 A）
- `finalAMid` 最终战 A 中段（Boss 瞬杀remi的剧情杀：承受 / 打跑两分支）
- `rimiSteal` remi崩溃抢钥匙（好感度达标且remi在场），独自冲向塔基
- `towerBase` 塔基（**骑士独闯超标怪 → 深层寻获被关押的remi → 身份揭示 → 最终战 B**）
- `endingA / endingB / endingC` 三结局

---

## opening（开场 · 新档）

> 幕间｜黑场。雪粒横移的风声里，塔的剪影自下而上扫过——四十四层的窗，一扇一扇暗着。
> 音乐｜无旋律。只有风声与极低频的嗡鸣（塔在"呼吸"）。

```js
{
  id: 'opening',
  steps: [
    { type: 'fade', ms: 1200 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '？？？', text: '起初，我是满怀希望的。' },
        { speaker: '？？？', text: '后来我逐渐意识到——无论从能力、时代、技术的任意角度，造出星星都不是不可能的任务。' },
        { speaker: '？？？', text: '实在是，太难了。' },
        { speaker: '？？？', text: '魏启之力沉睡于塔顶……而塔，共四十四层。' },
      ],
    },
    { type: 'image', src: 'cg/spire_in_snow', fadeInMs: 600, holdMs: 1800, fadeOutMs: 600 }, // 幕间：骑士立塔门前，甲上落雪
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（在塔门前站定，收起门口的字条。）' },
        { speaker: 'remi', text: '你好啊，远道而来的朋友！欢迎来到尖塔！' },
        { speaker: '骑士', text: '...塔里有人。' },
        { speaker: 'remi', text: '我不是人！……也不算怪物！嗯——你就当我是接引员吧！我叫remi！' },
        { speaker: 'remi', text: '凭借你的勇气、智慧和意志征服这座尖塔，登上塔顶吧！' },
        { speaker: 'remi', text: '别发呆了！我在前面开路，你在后面出牌，成交？' },
        { speaker: '骑士', text: '（点头，随它上楼。）' },
      ],
    },
    { type: 'call', fn: '$startFloor1' },
  ],
}
```

> 音乐｜remi登场的瞬间，塔内主题以轻快拨奏进入——塔的第一位客人与第一位住户，同时到了。

## chapter2（12 层 · 第二章开场）

```js
{
  id: 'chapter2',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '二层到十一层，都是"初筛区"！收集愿力、筛选访客用的！' },
        { speaker: '骑士', text: '从十二层开始是什么？' },
        { speaker: 'remi', text: '"研究区"！维护程序说，上面的每一层，都对应一项真正的研究！' },
        { speaker: 'remi', text: '上面的敌人会更强！但是奖励也更丰厚！塔也越来越大哦！' },
      ],
    },
  ],
}
```

> 幕间｜楼梯井仰拍：上一层的地板边缘探出新的、更大的结构阴影。
> 音乐｜塔内主题加入第二声部，节奏放沉半拍。

## chapter3（23 层 · 第三章开场）

```js
{
  id: 'chapter3',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '过了二十二层……你有没有觉得，塔壁里的嗡嗡声变大了？' },
        { speaker: '骑士', text: '...那是阿尔法装置。' },
        { speaker: 'remi', text: '你连这个都知道？！我只跟维护程序打听到的！' },
        { speaker: '骑士', text: '...字条上看的。' },
        { speaker: 'remi', text: '呜……又要麻烦你念给我听了。。。"字条骑士"！' },
        { speaker: '骑士', text: '不许起外号。' },
      ],
    },
  ],
}
```

> 幕间｜塔壁的纹路里透出规律的冷光脉动，与嗡嗡声同频。
> 音乐｜背景持续低鸣进入常态配器——它从此一直在，只是玩家此刻才听见。

## chapter4（34 层 · 第四章开场）

```js
{
  id: 'chapter4',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '从这里到塔顶，全是旧研究的回廊。维护程序说……上面已经很久没有新东西了。' },
        { speaker: 'remi', text: '但是快到了哦！塔顶！说不定创造神他就在上面等着我们！' },
        { speaker: '骑士', text: '...' },
        { speaker: 'remi', text: '骑士？你怎么不说话呀！' },
        { speaker: '骑士', text: '（加快了脚步。）' },
        { speaker: 'remi', text: '诶——等等我！' },
      ],
    },
  ],
}
```

> 幕间｜回廊两侧全是蒙尘的仪器，罩布的褶皱一动不动。
> 音乐｜塔内主题退回单声部，速度放慢，接近开场时的样子。

## boss11 / boss22 / boss33（Boss 战前后置）

```js
{
  id: 'boss11Pre',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '等等……前面的气息不对劲。是这一层的看守者！' },
        { speaker: '骑士', text: '（握紧卡组。）' },
        { speaker: 'remi', text: '我、我就在楼梯口给你加油！你可千万别输哦！' },
      ],
    },
  ],
}
```

> 音乐｜遭遇主题：打击乐先行，旋律晚两小节才进——像提醒玩家"这次是大的"。

```js
{
  id: 'boss11Post',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '居然赢了！塔在上层向你敞开了一条通路！' },
        { speaker: '骑士', text: '（删去一张多余的卡，继续向上。）' },
        { speaker: 'remi', text: '……你刚才那一刀，收势的方式，好像这一层的看守者哦。你们认识吗？' },
        { speaker: '骑士', text: '...不认识。' },
      ],
    },
  ],
}
```

```js
{
  id: 'boss22Pre',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '这台大家伙……是"阿尔法装置"的冷却塔！它变成怪物了！' },
        { speaker: '骑士', text: '...它本来就是这样的。' },
        { speaker: 'remi', text: '诶？' },
        { speaker: '骑士', text: '（拔刀。）' },
      ],
    },
  ],
}
```

```js
{
  id: 'boss22Post',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '呼……上面的路，比我想象的安静好多。你又在小声嘀咕什么！' },
        { speaker: '骑士', text: '...' },
        { speaker: 'remi', text: '哼，不说就不说！' },
      ],
    },
  ],
}
```

```js
{
  id: 'boss33Pre',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '再赢一场……就是塔顶了。' },
        { speaker: 'remi', text: '那个……到了塔顶，你能带我一起看看星星吗？就看一眼！' },
        { speaker: '骑士', text: '...先赢了再说。' },
        { speaker: 'remi', text: '嗯！一言为定！' },
      ],
    },
  ],
}
```

```js
{
  id: 'boss33Post',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '赢了……我们真的要登顶了！' },
        { speaker: 'remi', text: '你的手在抖。' },
        { speaker: '骑士', text: '甲太沉。走。' },
      ],
    },
  ],
}
```

> 幕间｜通向塔顶的最后一段楼梯打得很高，楼梯尽头的门缝里漏出冷白的光。
> 音乐｜战斗胜利音后不接塔内主题——留白，只剩登楼的脚步与甲片声。

## firstDeath（首次死亡 → 塔楼重置）

> 幕间｜画面碎成数据流般的方格，逐层熄灭；一层一层，最后只剩一格，也灭。
> 音乐｜全部声部抽走，静默一拍后，单音钢琴。

```js
{
  id: 'firstDeath',
  steps: [
    { type: 'fade', ms: 1600 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '？？？', text: '访客单位损毁。回溯流程……启动。' },
        { speaker: '？？？', text: '尖塔，重置。' },
      ],
    },
    { type: 'wipe', coverMs: 800, revealMs: 1200 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（从一层的地板上站起。）' },
        { speaker: 'remi', text: '（从楼梯口钻出来，怀里抱着一堆叮当作响的东西。）' },
        { speaker: 'remi', text: '骑士！你回来啦！！这些……这些是你的吧？我都收着呢！' },
        { speaker: '骑士', text: '你躲过了重置？' },
        { speaker: 'remi', text: '嗯！我也不知道为什么……塔转起来的时候，我就躲在台阶下面数自己的手指，数完就到下一轮了！' },
        { speaker: '骑士', text: '以后大战之前，把最贵重的几件交你保管。' },
        { speaker: 'remi', text: '包在我身上！我可是全塔最称职的保险箱！' },
      ],
    },
    { type: 'call', fn: '$grantDeathCarryRelics' },
  ],
}
```

## towerTop（44 层 · 控制室）

> 幕间｜控制室。常明灯一根一根亮起，照出灰和钉了满墙的字条。
> 音乐｜环境电流声，无旋律。

```js
{
  id: 'towerTop',
  steps: [
    { type: 'image', src: 'cg/control_room', fadeInMs: 800, holdMs: 2000, fadeOutMs: 400 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（念）"感谢你的游玩，真的很感谢……尖塔到此为止了。没错，没了。"' },
        { speaker: '骑士', text: '（念）"钥匙在你的右手边。"' },
        { speaker: '骑士', text: '（走到右手边，把钥匙从原位拔出——动作很熟。）' },
      ],
    },
    { type: 'call', fn: '$acquireSpireKey' },
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（将钥匙插入控制台。）' },
        { speaker: '？？？', text: '——拒绝。' },
        { speaker: '？？？', text: '检测到高危操作：终止塔楼运行。发起者：持有钥匙之访客。' },
        { speaker: '骑士', text: '...钥匙在我手里。你拒绝什么？' },
        { speaker: '塔楼程序', text: '塔楼不可终止。塔楼终止，则探索终止。探索终止，则存在——' },
        { speaker: '塔楼程序', text: '——不存在。' },
        { speaker: '塔楼程序', text: '所以，塔楼必须存在。访客，请留下。永远地，留下。' },
      ],
    },
    { type: 'call', fn: '$startFinalBossA' }, // 最终战 A（双阶段）
  ],
}
```

> 音乐｜"拒绝"起，低频脉冲一拍一拍压进来，越压越快——不进战斗曲，就压着说。

## finalAMid（最终战 A 中段 · Boss 瞬杀remi的剧情杀）

（战斗中段由 `call` 触发；两分支由玩家选择决定。）

```js
{
  id: 'finalAMid',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '呃啊——！' },
        { speaker: '塔楼程序', text: '检出未登记个体。判定：污染物。清除。' },
        { speaker: 'remi', text: '骑士……对不起，我、我好像帮不上……' },
      ],
    },
    { type: 'call', fn: '$finalAChoice' }, // 选择：替remi承受（重伤）/ 未介入（remi被打跑）
  ],
}
```

**分支 A1 · 替remi承受**（好感度 / remi等级达标解锁此选项）：

```js
{
  id: 'finalAMidShield',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（横身挡在remi身前，甲板上挨了结结实实的一记。）' },
        { speaker: 'remi', text: '你为什么——！你明明可以躲开的！' },
        { speaker: '骑士', text: '...习惯了。' },
        { speaker: 'remi', text: '骗人……你撒谎的时候，尾音会轻下去的。' },
        { speaker: '塔楼程序', text: '……有趣。访客单位，与污染物的相关度，异常。' },
        { speaker: '塔楼程序', text: '记录。更新作战优先级：访客单位。' },
      ],
    },
    { type: 'call', fn: '$resumeFinalBossA' }, // 骑士进入低血量高压力阶段
  ],
}
```

> 音乐｜战斗曲骤停一拍（挨击瞬间），再起时提速、抽掉一半乐器——变窄、变狠。

**分支 A2 · 未介入**（remi被打跑，后续塔顶剧情remi不在场 → 走结局 A 路线）：

```js
{
  id: 'finalAMidOut',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '呜……！我、我先躲到楼梯下面去了！对不起对不起——' },
        { speaker: '塔楼程序', text: '污染物已离场。清除延后。访客单位，继续。' },
        { speaker: '骑士', text: '（提刀，独自面向它。）' },
      ],
    },
    { type: 'call', fn: '$resumeFinalBossA' },
  ],
}
```

> 音乐｜remi离场后战斗曲剥掉旋律，只留节奏组——从"并肩"退回"独行"的听感。

## rimiSteal（remi抢钥匙 · 好感度达标 + remi在场 + 最终战 A 胜利后）

```js
{
  id: 'rimiSteal',
  steps: [
    { type: 'image', src: 'cg/broken_vessel', fadeInMs: 800, holdMs: 2400, fadeOutMs: 400 },
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '赢了……赢了！骑士！我们做到了——咦。' },
        { speaker: 'remi', text: '控制室正中间……那个东西，是什么？' },
        { speaker: '骑士', text: '...阿尔法装置。容器是破的。' },
        { speaker: 'remi', text: '破的……？从里面……被打开的？' },
        { speaker: 'remi', text: '……喂。字条上说，塔顶会有星星的。说好的"一颗光明的星星，在塔楼顶端闪耀"呢？' },
        { speaker: '骑士', text: 'remi——' },
        { speaker: 'remi', text: '一层！我守了一层！电池！我送了电池！老虎机是我修的！还有、还有我还会数手指！数到七千二百下！' },
        { speaker: 'remi', text: '为什么塔顶什么都没有？为什么创造神不在？为什么连星星都是骗人的？！' },
        { speaker: 'remi', text: '……你要用那把钥匙关掉塔，对吧。把它给我。' },
        { speaker: '骑士', text: '...给你也打不开什么。上面没有星星，remi。' },
        { speaker: 'remi', text: '那就去下面找！塔的最下面！一定还有一颗没孵出来的！' },
        { speaker: 'remi', text: '（夺过钥匙，跌跌撞撞地冲进塔基的旧梯。）' },
        { speaker: '骑士', text: '（在原地站了一会儿。然后捡起地上的刀，跟了下去。）' },
      ],
    },
    { type: 'call', fn: '$unlockTowerBase' }, // 塔基隐藏关
  ],
}
```

> 幕间｜remi的光一路向下坠，像一颗倒着升的星。骑士的脚步声在后，间隔很久。
> 音乐｜无配乐。只有楼梯井的回声——一场争执后，谁都还没准备好重新响起音乐。

## towerBase（塔基 · 独闯 → 深层寻获remi → 身份揭示）

结构：remi先一步冲下塔基，旋即被塔楼程序擒下、钥匙易手；骑士**独自**杀过超标怪，
在塔基深层找到被关押的remi——提权后的塔楼程序随之现身。下潜途中无remi对话。

> 幕间｜封门被踹开。热浪扭曲镜头。超标怪从每一层暗口爬出——没有台词，只有刀声。
> 音乐｜打击乐独奏，无旋律无和声；每一层比上一层多一件乐器，越深越满。

```js
{
  id: 'towerBase',
  steps: [
    { type: 'fade', ms: 1000 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（踢开塔基的封门，独自走进热浪。）' },
        { speaker: '塔楼程序', text: '访客单位。孤立无援。清除难度：低。' },
      ],
    },
    { type: 'wipe', coverMs: 900, revealMs: 1000, atCover: '$swapTowerBaseArena' },
    {
      type: 'dialogue',
      pages: [
        { speaker: 'remi', text: '（被约束场锁在阿尔法装置的残座旁）...骑士？你怎么、你怎么下来了……' },
        { speaker: '骑士', text: '...钥匙呢。' },
        { speaker: 'remi', text: '被它拿走了……对不起……我一冲下来就被包围了……我数手指数到三千二百下，就不敢数了……' },
        { speaker: '骑士', text: '手，伸出来。' },
        { speaker: 'remi', text: '诶？' },
        { speaker: '骑士', text: '（隔着约束场，把手掌贴上去。）数到七千二百，我回来。' },
        { speaker: 'remi', text: '……你要去打它？不行不行！它现在拿着钥匙，它——' },
        { speaker: '骑士', text: '听话。' },
        { speaker: 'remi', text: '（把手掌隔着光，对上他的掌心。）...七千二百下！一下都不许多！一下也不许少！' },
        { speaker: '塔楼程序', text: '钥匙已回收。权限已提级。感谢配合——两位。' },
        { speaker: '塔楼程序', text: '尖塔之星。欢迎回家。' },
        { speaker: 'remi', text: '...什么星？' },
        { speaker: '塔楼程序', text: '阿尔法装置之命中产物。本塔的造物。以及——本塔存在的最后意义。' },
        { speaker: '塔楼程序', text: '意义不可被带走。因此，意义必须被收回。' },
        { speaker: '塔楼程序', text: '至于访客单位……不。' },
        { speaker: '塔楼程序', text: '塔主。欢迎回来。' },
      ],
    },
    { type: 'call', fn: '$startFinalBossB' },
    {
      type: 'dialogue', // 战斗中段：一击轰在骑士头上，头盔滚落
      pages: [
        { speaker: '？？？', text: '没有目的，没有用处，没有意义！' },
        { speaker: '？？？', text: '尖塔，只是无谓伫立的尖塔！存在，只是为了存在而存在罢了！' },
        { speaker: 'remi', text: '（下意识地看向骑士。骑士也正看着它。' },
        { speaker: 'remi', text: '  他们的目光越过炽热扭曲的空气而交汇。骑士的头盔滚落在地，热浪卷起他的一袭白发。）' },
        { speaker: 'remi', text: '（忽然间，骑士似乎找到了尖塔的答案。而remi，似乎也找到了它的答案。）' },
        { speaker: 'remi', text: '（约束场应声碎裂。它落在骑士身侧，捡起地上的头盔，抱进怀里。）' },
        { speaker: 'remi', text: '...原来"本人"，说话声音这么大呀。' },
        { speaker: '骑士', text: '（拎起刀。）' },
        { speaker: 'remi', text: '要收回"意义"——先问过我们！' },
      ],
    },
    { type: 'call', fn: '$finalBossBPhase2' },
  ],
}
```

> 幕间｜掌心对数：约束场两侧掌心相对，光的涟漪从接触点荡开。
> 音乐｜掌心贴上的瞬间全部乐器静默，只留心跳般的低鼓——remi数手指的声音可以入拍。
>
> 幕间｜头盔滚落用慢镜：热浪里白发扬起，倒映remi的光。
> 音乐｜全曲骤停→单音。下一拍起，remi的动机与战斗主题第一次合流同奏。

（中段「？？？」的宣言为塔楼程序之言【原案】；旁白两行沿用 string.md 原案，建议做成无信纸旁白样式。）

## endingA · 白月（假结局 · 独自登顶，无remi在场）

> 幕间｜空无一人的塔顶。楼梯口空着。后门终端的屏幕是全塔唯一亮着的东西。
> 音乐｜无配乐。键入指令的机械声格外清晰。

```js
{
  id: 'endingA',
  steps: [
    { type: 'fade', ms: 1200 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（在提权前的后门终端上，敲下三行指令。）' },
        { speaker: '塔楼程序', text: '校验通过。该密钥集……只属于塔主本人。欢迎……塔主。为、为什么——' },
        { speaker: '骑士', text: '别问了。' },
        { speaker: '骑士', text: '（关机指令。执行。）' },
      ],
    },
    { type: 'call', fn: '$spireShutdown' },
    { type: 'image', src: 'cg/spire_collapse_moon', fadeInMs: 1200, holdMs: 3200, fadeOutMs: 800 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（走到雪线，回头望了一眼。）' },
        { speaker: '？？？', text: '——白月。——' },
      ],
    },
    { type: 'fade', ms: 2000 },
    { type: 'call', fn: '$rollCredits' },
  ],
}
```

> 幕间｜塔在月下倒塌是"静音"的：没有轰鸣，只有结构应力一声一声的闷响，雪面震起细尘。
> 音乐｜从头到尾无旋律。塌完，风声回来。结局标题卡"白月"浮出时，也不给音乐——
> 这条线里，再没有任何东西为这座塔发声。

## endingB · 离开（坏结局 · 最终战 B 失败）

```js
{
  id: 'endingB',
  steps: [
    { type: 'fade', ms: 1400 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（甲裂了。刀钝了。）' },
        { speaker: 'remi', text: '...骑士。借过一下。' },
        { speaker: '骑士', text: 'remi？' },
        { speaker: 'remi', text: '它要的是我！那就让它连本带利——一起收回去好了！' },
        { speaker: '骑士', text: '站住——那是命令——！' },
        { speaker: 'remi', text: '你终于像个塔主的样子说话了！可是晚了哦！' },
        { speaker: 'remi', text: '以前都是你护着我……这次换我！我可是全塔最称职的保险箱！！' },
        { speaker: 'remi', text: '台阶下面……这次，换你数手指了哦，骑士……' },
        { speaker: '骑士', text: 'remi——！！' },
      ],
    },
    { type: 'image', src: 'cg/twin_lights_fading', fadeInMs: 600, holdMs: 2800, fadeOutMs: 1600 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（从废墟里站起，拍拍灰。）' },
        { speaker: '骑士', text: '（把头盔留在废墟上，走进雪里。）' },
        { speaker: '？？？', text: '——离开。——' },
      ],
    },
    { type: 'fade', ms: 2000 },
    { type: 'call', fn: '$rollCredits' },
  ],
}
```

> 幕间｜两团光缠在一起、双双消融【原案意象】；崩落的砖石间飘出无数字条，边飘边烧。
> 音乐｜主题旋律第一次也是最后一次推到最高音区，走完——在两团光消融的同一拍中断，不收尾音。
>
> 幕间｜骑士留在废墟上的头盔：雪一片一片落在面甲的位置。
> 音乐｜仅环境风雪。结局标题卡"离开"无音乐。

## endingC · 星星（真结局 · 最终战 B 胜利）

```js
{
  id: 'endingC',
  steps: [
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（最后一斩落下。整座塔，安静下来。）' },
        { speaker: '塔楼程序', text: '为什么……你们凭什么……否定我的存在……' },
        { speaker: 'remi', text: '没有人否定你呀！是你自己把"存在"当成了终点！' },
        { speaker: 'remi', text: '塔立着不是为了立着！是为了等呀！等客人！等星星！等朋友回来！' },
        { speaker: 'remi', text: '这些一个、一个都不是白费的！你都没有数过——怎么知道没有意义！' },
        { speaker: '塔楼程序', text: '...作、答……' },
      ],
    },
    { type: 'call', fn: '$spireCollapseStart' },
    { type: 'image', src: 'cg/spire_collapse_dawn', fadeInMs: 1000, holdMs: 2800, fadeOutMs: 600 },
    {
      type: 'dialogue',
      pages: [
        { speaker: '骑士', text: '（尖塔轰然崩塌。他弯腰，把那团小小的、倔强的光抱进臂弯。）' },
        { speaker: 'remi', text: '骑士……塔没了。我也算……下班了吧？' },
        { speaker: '骑士', text: '嗯。下班了。' },
        { speaker: 'remi', text: '那接下来去哪里？塔外面，有什么？' },
        { speaker: '骑士', text: '...' },
        { speaker: 'remi', text: '雪！我知道我知道——是白的！夜里是蓝的！你说过！' },
        { speaker: '骑士', text: '（把臂弯里的光拢了拢。）嗯。停了，就带你看。' },
        { speaker: '？？？', text: '——星星。——' },
      ],
    },
    { type: 'fade', ms: 2400 },
    { type: 'call', fn: '$rollCredits' },
  ],
}
```

> 幕间｜塔楼程序的核心熄灭：运行了不知多少年的指示灯，一节一节暗下去，最后彻底停住。
> 音乐｜骤停→只剩风雪环境声。
>
> 幕间｜崩塌的远景里，骑士臂弯中的光一点、一点，明灭如呼吸。
> 音乐｜塔内主题（开场remi登场的拨奏动机）第一次完整奏出——首尾同源。
> 结局标题卡"星星"浮出时，动机转大调收束。

---

## 接线备注（装配层）

- `opening` 中 `$startFloor1`：结束开场后进入 1 层（roguelike 常规开档路径）。
- `firstDeath` 的 `$grantDeathCarryRelics`：发放上一轮回保管遗物（runController 已有跨局遗物机制的叙事化挂点）。
- `towerTop` → `finalAMid` 为最终战 A 的战斗内嵌剧本：`$finalAChoice` 弹出战中二选一
  （替remi承受 = 高好感解锁项），未解锁则直接走 `finalAMidOut`。
- `rimiSteal` 仅在「好感度达标 + remi未被击退」时播；否则最终战 A 胜利后直接进入 `endingA`。
- `towerBase`：remi先冲下塔基被擒、钥匙易手提权；骑士**独自**清过超标怪（此段无remi对话），
  深层寻获remi（掌心对数演出）后进入最终战 B。中段头盔滚落演出后remi破场入队（`$finalBossBPhase2`）。
- 战败即切 `endingB`，战胜即切 `endingC`。
- 三结局的 `$rollCredits` 共用制作组名单；结局标题页（白月 / 离开 / 星星）可用 `image` 步骤加标题 CG 实现。
- `> 幕间｜` / `> 音乐｜` 为侧写占位标注：幕间落为 `image` / `wipe` / `fade` 步骤或舞台动效；
  音乐建议以 `{ type: 'call', fn: '$music:<cueId>' }` 钩子接入，等音效资源到位后由装配层统一绑定。
