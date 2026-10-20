(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SenkouServiceConsentData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = {
  "title": "工作室服务须知与免责声明",
  "subtitle": "森口电竞 · 预约前，请先了解彼此的约定。",
  "highlight": "提交表仅用于表达预约意向，不代表已下单或已付款。服务内容、时间、费用及取消安排，均需双方另行确认；游戏胜负、掉落和收益不作保证。",
  "guidelinesTitle": "《工作室服务须知》",
  "guidelines": "01 / 我们提供什么\n森口电竞是围绕《三角洲》开展护航、娱乐、陪玩等游戏协作的小工作室，以游戏体验和交流为主，与游戏开发、运营方不存在官方隶属或授权关系。各类需求须在游戏规则允许的范围内沟通安排。\n\n02 / 预约与费用确认\n请如实填写想约的服务、模式、时间与联系方式。填写表单不保证一定有队友或档期，也不自动产生付款义务；有偿服务开始前，双方应明确人员、内容、时长或目标、价格、结算方式及取消、退款规则。未确认的额外项目与费用，应先协商再执行。\n\n03 / 游戏体验与预期\n游戏存在竞技对抗、随机掉落和局内损失。护航、陪玩或跑刀相关需求均不代表包胜、包撤离、必出指定物品或保证收益；如另有具体服务目标，应在开始前明确约定及未达成时的处理方式。请按自己的预算与承受能力选择。\n\n04 / 取消、改期与退款\n需要变更或取消时，请尽早通过预约沟通渠道说明，并按双方有效约定处理。未提供服务、服务不符合约定或依法应当退款的情形，依法协商退款或补救；本须知不构成“一律不退”的依据。\n\n05 / 账号与游戏规则\n拒绝外挂、脚本、作弊、欺诈及其他违规需求。涉及账号授权的需求，须先确认游戏规则是否允许；不支持违反规则的账号共享、代登或操作。请自行保管账号、支付信息与设备，不向表单或不明联系人提供密码、短信验证码、身份证及支付凭证等敏感资料。\n\n06 / 联系信息与相处方式\n表单只填写本次预约所需的联系方式和需求；我们仅将预约信息用于联系、安排与处理本次服务问题，不擅自公开或用于无关推广。如需更正或删除已提交资料，请通过预约沟通渠道提出。请勿提交他人的个人资料，尊重队友，不辱骂、骚扰、歧视或恶意干扰游戏；出现争议可保留必要记录并及时沟通。\n\n07 / 参与条件\n有偿服务仅面向年满 18 周岁的用户。请遵守游戏实名、防沉迷及相关规则，合理安排时间，避免冲动消费；不得借预约进行赌博、诈骗或其他违法活动。",
  "disclaimerTitle": "《免责声明》",
  "disclaimer": "01 / 可预见的游戏风险\n网络延迟、设备异常、服务器维护、版本调整及其他玩家行为等，可能影响游戏体验与安排。发生异常时双方应及时沟通，合理采取暂停、改期或其他补救措施；责任和费用根据实际情况、双方有效约定及适用法律确定，不以本声明笼统免除工作室的责任。\n\n02 / 非官方承诺与额外交易\n游戏规则、账号处置和运营决定由游戏运营方作出，工作室无权干预，也不承诺解除封禁或规避风控。未经双方明确确认的个人口头保证、额外收费或私下交易，不自动纳入本次服务；请通过已确认的沟通渠道核实，并保留必要的约定与付款记录。\n\n03 / 进入第三方表单\n同意后将前往问卷星提交预约。填写前请查看该表单展示的内容及平台隐私说明，按需自愿提供资料；本次点击本身不会提交预约、扣款或产生订单，也不代表放弃投诉、退款或其他依法享有的权利。\n\n04 / 责任边界与争议处理\n本须知用于提示服务范围和风险，不排除或限制消费者依法享有的权利。因工作室违约或过错造成损失的，依法承担相应责任；不得免除造成他人人身损害，或因故意、重大过失造成对方财产损失的责任。如有疑问，可先关闭弹窗沟通，确认理解后再自愿预约；协商不成，可依法通过投诉、调解或诉讼等途径处理。",
  "destination": "同意后前往问卷星提交表；当前页面不会提交预约信息或扣款。"
};
  const fields = [
  {
    "key": "title",
    "label": "弹窗标题",
    "max": 80,
    "multiline": false
  },
  {
    "key": "subtitle",
    "label": "标题下方介绍",
    "max": 300,
    "multiline": false
  },
  {
    "key": "highlight",
    "label": "顶部重点提示",
    "max": 1000,
    "multiline": true
  },
  {
    "key": "guidelinesTitle",
    "label": "服务须知标题",
    "max": 80,
    "multiline": false
  },
  {
    "key": "guidelines",
    "label": "工作室服务须知",
    "max": 12000,
    "multiline": true
  },
  {
    "key": "disclaimerTitle",
    "label": "免责声明标题",
    "max": 80,
    "multiline": false
  },
  {
    "key": "disclaimer",
    "label": "服务免责声明",
    "max": 12000,
    "multiline": true
  },
  {
    "key": "destination",
    "label": "底部跳转提示",
    "max": 500,
    "multiline": true
  }
];
  function empty() { return { ...defaults }; }
  function validate(value) {
    if (value == null) return empty();
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('服务弹窗内容无效。');
    const result = {};
    for (const {key, label, max} of fields) {
      const text = value[key] ?? defaults[key];
      if (typeof text !== 'string' || !text.trim() || text.length > max) throw new Error(label + '不能为空，且不能超过 ' + max + ' 字。');
      result[key] = text.trim();
    }
    return result;
  }
  return { empty, validate, fields };
});
