(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SenkouCareersData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaultGuidelines = "1. 报名性质：这里的“招聘”“职位”主要用于寻找游戏搭子与同好协作伙伴，以娱乐组队、游戏交流和自愿参与为主。填写问卷仅代表表达加入意向，不代表已被录用、已加入工作室或已取得接单资格。\n2. 参与条件：本次招募面向年满 18 周岁的游戏爱好者。请如实说明游戏昵称、擅长方向和可参与时段，理性安排游戏时间，尊重队友，友好沟通。\n3. 自愿参与：普通娱乐组队可按个人时间沟通安排，也可提出退出。本次报名不承诺固定岗位、固定工资、订单数量或保底收入，请勿把报名结果当作收入保障。\n4. 有偿合作另行确认：若后续涉及客户订单、内容制作或其他有偿任务，应先另行明确任务内容、报酬、结算方式、完成时间与双方责任。尚未确认前，请勿以工作室名义接单、收费或向客户作出承诺。\n5. 游戏与交流规则：遵守法律和游戏平台规则，不使用外挂、脚本或其他作弊手段，不辱骂、骚扰他人，不冒用身份，不擅自传播他人隐私、聊天记录或未经许可的素材。\n6. 账号与信息保护：报名不需要支付报名费、押金或培训费。请勿提交游戏账号密码、短信验证码、身份证照片、银行卡等敏感信息；涉及转账或共享账号的要求，请先核实并拒绝不合理要求。";
  const defaultDisclaimer = "1. 关于报名与关系：提交问卷、参与一次娱乐组队，均不等于当然建立劳动关系、劳务关系或其他有偿合作关系。若后续形成实际工作或有偿合作，应依具体约定、实际履行情况和适用法律确定双方权利义务，不能仅凭本说明认定或排除。\n2. 关于游戏体验：网络状态、设备、版本调整、匹配机制和队伍配合都会影响体验。娱乐组队不承诺胜率、段位提升、收益或任何特定结果；如另有服务约定，应按具体约定处理。\n3. 关于费用与纠纷：请先明确约定再开展有偿任务。遇到报酬、订单、账号或沟通争议时，请保留相关记录并及时协商，也可依法寻求处理。请勿用“娱乐交流”替代已约定的报酬或其他应履行的义务。\n4. 关于问卷与个人信息：同意后会前往第三方问卷星页面。请只填写与报名沟通有关、必要的信息，并留意该平台的隐私说明。报名信息仅用于招募沟通与意向确认；如需查询、更正或申请删除，请通过网站联系方式联系工作室。其他用途应另行说明并依法处理。\n5. 权利保留：本说明用于说明报名安排与基本规则，不排除或限制参与者依法享有的权利，也不免除任何一方依法应承担的责任。人身损害以及故意、重大过失等情形，依法处理。\n阅读提示：请完整阅读以上内容。如对参与方式、费用、报酬或信息使用有疑问，可先关闭弹窗并联系工作室确认。点击“我已阅读并同意”表示你已阅读本页须知，并自愿继续填写报名问卷。";
  const dialogDefaults = {
  "dialogTitle": "应聘须知与免责声明",
  "dialogIntro": "森口电竞",
  "highlight": "以娱乐组队、游戏交流为主。报名不代表录用，不承诺固定工资或收入；涉及有偿合作时，需另行确认。",
  "guidelinesTitle": "应聘须知",
  "disclaimerTitle": "免责声明",
  "destination": "同意后前往报名表；当前页面不会提交报名信息。"
};
  function empty() { return { version: 1, headline: '把热爱，变成一起前进的力量。', intro: '寻找认真对待每一局、也认真对待队友的你。', notice: '选择适合你的合作方向，展开职位了解要求。', directions: [], types: [], jobs: [], application: { ...dialogDefaults, label: '申请职位', url: '', guidelines: defaultGuidelines, disclaimer: defaultDisclaimer, instructions: '请准备你的游戏昵称、擅长方向与可配合时段，联系工作室沟通。' } }; }
  function validate(value) {
    const fail = message => { throw new Error(message); };
    if (!value || value.version !== 1) fail('招聘数据版本无效，请重新载入。');
    const text = (item, label, max, required = false) => {
      if (typeof item !== 'string' || item.length > max || (required && !item.trim())) fail(label + (required ? '不能为空，且' : '') + '不能超过 ' + max + ' 字。');
      return item.trim();
    };
    const list = (items, label, max, map) => {
      if (!Array.isArray(items) || items.length > max) fail(label + '最多保留 ' + max + ' 项。');
      const ids = new Set();
      return items.map(item => {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id)) fail(label + '编号无效或重复。');
        ids.add(item.id); return map(item);
      });
    };
    const directions = list(value.directions, '招聘方向', 20, item => ({ id: item.id, label: text(item.label, '方向名称', 30, true) }));
    const types = list(value.types, '招聘类型', 40, item => ({ id: item.id, label: text(item.label, '类型名称', 30, true) }));
    const jobs = list(value.jobs, '职位', 100, item => {
      if (!directions.some(direction => direction.id === item.directionId) || !types.some(type => type.id === item.typeId)) fail('请为每个职位选择有效的招聘方向和类型。');
      if (!['published', 'draft'].includes(item.status)) fail('职位状态无效。');
      const result = { id: item.id, directionId: item.directionId, typeId: item.typeId, status: item.status };
      for (const [key, label, max] of [['title', '职位名称', 80], ['location', '工作地点', 50], ['arrangement', '合作方式', 30], ['experience', '经验要求', 50], ['headcount', '招募人数', 30], ['compensation', '报酬说明', 80], ['summary', '职位简介', 300], ['responsibilities', '工作内容', 3000], ['requirements', '任职要求', 3000]]) result[key] = text(item[key], label, max, ['title', 'location', 'arrangement', 'experience'].includes(key));
      return result;
    });
    const application = value.application || {};
    const url = text(application.url, '招聘联系链接', 1000);
    if (url) {
      let parsed; try { parsed = new URL(url); } catch { fail('招聘联系链接需要完整的 https、http、mailto 或 tel 地址。'); }
      if (!['https:', 'http:', 'mailto:', 'tel:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\x00-\x20]/.test(url)) fail('招聘联系链接无效。');
    }
    return { version: 1, headline: text(value.headline, '招聘页标题', 80, true), intro: text(value.intro, '招聘页介绍', 300), notice: text(value.notice, '筛选提示', 200), directions, types, jobs, application: { dialogTitle: text(application.dialogTitle ?? dialogDefaults.dialogTitle, "弹窗标题", 80, true), dialogIntro: text(application.dialogIntro ?? dialogDefaults.dialogIntro, "标题下方介绍", 200, true), highlight: text(application.highlight ?? dialogDefaults.highlight, "顶部重点提示", 1000, true), guidelinesTitle: text(application.guidelinesTitle ?? dialogDefaults.guidelinesTitle, "应聘须知标题", 80, true), disclaimerTitle: text(application.disclaimerTitle ?? dialogDefaults.disclaimerTitle, "免责声明标题", 80, true), destination: text(application.destination ?? dialogDefaults.destination, "底部跳转提示", 500, true), label: text(application.label, '联系按钮文字', 30, true), url, guidelines: text(application.guidelines ?? defaultGuidelines, '应聘须知', 6000, true), disclaimer: text(application.disclaimer ?? defaultDisclaimer, '免责声明', 6000, true), instructions: text(application.instructions, '申请说明', 2000, true) } };
  }
  return { empty, validate };
});
