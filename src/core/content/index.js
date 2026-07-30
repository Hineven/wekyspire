// 最小测试内容总装配：显式 import 触发各注册表登记。
// （Core 保持环境无关，不用 import.meta.glob；应用层如需自动收集可自行 glob。）
import '../effects/definitions/strength.js';
import './effects.js';
import './skills.js';
import './enemies.js';
import './allies.js';
import './abilities.js';
