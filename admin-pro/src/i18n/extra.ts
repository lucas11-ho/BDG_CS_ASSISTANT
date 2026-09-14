import { EXACT } from "./messages";

type Entry = readonly [string, string, string];

const extra: readonly Entry[] = [
  ["Select records first", "请先选择记录", "မှတ်တမ်းများကို အရင်ရွေးပါ"],
  ["Delete this item?", "删除此项目？", "ဤအရာကို ဖျက်မလား?"],
  ["Delete ALL quick replies?", "删除全部快捷回复？", "Quick reply အားလုံးကို ဖျက်မလား?"],
  ["Row", "行", "အတန်း"],
  ["Image", "图片", "ပုံ"],
  ["Skipped", "已跳过", "ကျော်ထားသည်"],
  ["Warnings / Error", "警告 / 错误", "သတိပေးချက် / အမှား"],
  ["Stable slug", "固定 Slug", "တည်ငြိမ်သော Slug"],
  ["Could not load import history", "无法加载导入历史", "တင်သွင်းမှုမှတ်တမ်းကို မဖတ်နိုင်ပါ"],
  ["Preview Question + Locale changes before importing. Topic is locale-specific, so use the same language as each FAQ row. Spreadsheet content imports as Draft by default.", "导入前预览“问题 + 语言”变更。主题按语言分别保存，因此每一行 FAQ 的主题请使用该行对应的语言。默认以草稿状态导入表格内容。", "မတင်သွင်းမီ Question + Locale ပြောင်းလဲမှုများကို Preview ကြည့်ပါ။ Topic သည် locale တစ်ခုချင်းစီအလိုက်ဖြစ်သောကြောင့် FAQ အတန်းတစ်ခုစီတွင် သက်ဆိုင်ရာ ဘာသာစကားကို အသုံးပြုပါ။ Spreadsheet အကြောင်းအရာများကို မူလအားဖြင့် Draft အဖြစ် တင်သွင်းမည်။"],
  ["Stable slug + Guide locale identifies each Guide. Insert-image-in-cell is supported when the exported XLSX exposes the embedded image; unreadable images are reported as warnings instead of failing the row.", "Stable slug + Guide 语言共同标识每个指南。如果导出的 XLSX 能提供嵌入图片，则支持单元格内图片；无法读取的图片会显示为警告，不会导致整行失败。", "Stable slug + Guide locale ဖြင့် Guide တစ်ခုစီကို သတ်မှတ်သည်။ Export လုပ်ထားသော XLSX ထဲတွင် embedded image ကို ဖတ်နိုင်ပါက cell အတွင်းပုံကို ထောက်ပံ့သည်။ မဖတ်နိုင်သောပုံများကို row ပျက်စေမည့်အစား warning အဖြစ် ပြမည်။"],
  ["Rows with validation errors are skipped. FAQ Topic is saved per locale, so translate the Topic label in each locale row. By default every imported row becomes Draft so you can review it in Admin before publishing.", "验证失败的行会被跳过。FAQ 主题按语言分别保存，因此请在每个语言行中填写对应语言的主题。默认情况下所有导入行都会成为草稿，发布前可先在管理后台检查。", "Validation အမှားရှိသော row များကို ကျော်မည်။ FAQ Topic ကို locale တစ်ခုချင်းစီအလိုက် သိမ်းသောကြောင့် locale row တစ်ခုစီတွင် Topic ကို သက်ဆိုင်ရာဘာသာဖြင့် ရေးပါ။ မူလအားဖြင့် တင်သွင်းသော row အားလုံး Draft ဖြစ်ပြီး မထုတ်ဝေမီ Admin တွင် စစ်ဆေးနိုင်သည်။"],
  ["Rows with validation errors are skipped. Unknown Guide buttons are warnings. By default every imported row becomes Draft so you can review it in Admin before publishing.", "验证失败的行会被跳过。无法识别的指南按钮会显示警告。默认情况下所有导入行都会成为草稿，发布前可先在管理后台检查。", "Validation အမှားရှိသော row များကို ကျော်မည်။ မသိသော Guide button များကို warning ပြမည်။ မူလအားဖြင့် တင်သွင်းသော row အားလုံး Draft ဖြစ်ပြီး မထုတ်ဝေမီ Admin တွင် စစ်ဆေးနိုင်သည်။"],

  ["Every enabled Answer is trusted private knowledge for the AI Assistant. Question is a human-readable title/example, not a trigger. Runtime retrieval evaluates the Answer content and can combine several relevant knowledge entries. AI Knowledge is separate from Guide-page FAQs and does not count toward the 24,000-character Assistant Setup runtime.", "每个已启用的答案都会作为 AI 助手可信的私有知识。问题只是便于阅读的标题/示例，不是触发词。运行时检索会评估答案内容，并可组合多个相关知识条目。AI 知识与指南页 FAQ 相互独立，也不计入 Assistant Setup 的 24,000 字符运行时限制。", "Enabled ဖြစ်သော Answer တစ်ခုစီသည် AI Assistant အတွက် ယုံကြည်ရသော private knowledge ဖြစ်သည်။ Question သည် လူဖတ်ရှုရန် ခေါင်းစဉ်/ဥပမာသာ ဖြစ်ပြီး trigger မဟုတ်ပါ။ Runtime retrieval သည် Answer အကြောင်းအရာကို စစ်ဆေးပြီး သက်ဆိုင်ရာ knowledge entry များစွာကို ပေါင်းစပ်နိုင်သည်။ AI Knowledge သည် Guide-page FAQ များနှင့် သီးခြားဖြစ်ပြီး Assistant Setup 24,000-character runtime ထဲ မတွက်ပါ။"],
  ["Please select an .xlsx Excel workbook", "请选择 .xlsx Excel 工作簿", ".xlsx Excel workbook ကို ရွေးပါ"],
  ["Could not load AI Knowledge", "无法加载 AI 知识", "AI Knowledge ကို မဖတ်နိုင်ပါ"],
  ["Could not save AI Knowledge", "无法保存 AI 知识", "AI Knowledge ကို မသိမ်းနိုင်ပါ"],
  ["Could not delete AI Knowledge", "无法删除 AI 知识", "AI Knowledge ကို မဖျက်နိုင်ပါ"],
  ["Could not download the AI Knowledge template", "无法下载 AI 知识模板", "AI Knowledge template ကို ဒေါင်းလုဒ်မလုပ်နိုင်ပါ"],
  ["Could not preview the AI Knowledge workbook", "无法预览 AI 知识工作簿", "AI Knowledge workbook preview မကြည့်နိုင်ပါ"],
  ["Could not import AI Knowledge", "无法导入 AI 知识", "AI Knowledge ကို မတင်သွင်းနိုင်ပါ"],
  ["Rows marked CREATE will be added. Rows marked UPDATE match an existing Question and will replace its Type, Answer, and Enabled state. Invalid or duplicate workbook rows are skipped. Nothing is written until you click Import Add / Update.", "标记为 CREATE 的行会新增；标记为 UPDATE 的行会匹配已有问题并替换其类型、答案和启用状态。无效或重复的工作簿行会被跳过。在点击“导入新增 / 更新”之前不会写入任何数据。", "CREATE ဟု သတ်မှတ်ထားသော row များကို အသစ်ထည့်မည်။ UPDATE row များသည် ရှိပြီးသား Question နှင့် ကိုက်ညီပါက Type, Answer နှင့် Enabled အခြေအနေကို အစားထိုးမည်။ မမှန်ကန်သော သို့မဟုတ် ထပ်နေသော workbook row များကို ကျော်မည်။ Import Add / Update ကို နှိပ်မချင်း မည်သည့်ဒေတာကိုမျှ မရေးပါ။"],

  ["Create a client company, then generate its Chat, Guide, and Admin links automatically. Custom domains are optional later.", "创建客户公司后，系统会自动生成其 Chat、Guide 和 Admin 链接。之后可按需配置自定义域名。", "Client ကုမ္ပဏီတစ်ခု ဖန်တီးပြီးနောက် Chat, Guide နှင့် Admin link များကို အလိုအလျောက် ဖန်တီးပေးမည်။ Custom domain ကို နောက်မှ လိုအပ်သလို ထည့်နိုင်သည်။"],
  ["Generated platform access links", "已生成的平台访问链接", "ဖန်တီးထားသော ပလက်ဖောင်း ဝင်ရောက်လင့်များ"],
  ["Each platform receives Chat, Guide, and Admin routes immediately. A custom domain is optional and must be verified by Cloudflare.", "每个平台会立即获得 Chat、Guide 和 Admin 路由。自定义域名为可选项，并且必须通过 Cloudflare 验证。", "ပလက်ဖောင်းတစ်ခုစီသည် Chat, Guide နှင့် Admin route များကို ချက်ချင်းရရှိမည်။ Custom domain သည် ရွေးချယ်နိုင်ပြီး Cloudflare ဖြင့် အတည်ပြုရမည်။"],
  ["One active platform is allowed per client company", "每个客户公司仅允许一个启用的平台", "Client ကုမ္ပဏီတစ်ခုစီအတွက် active platform တစ်ခုသာ ခွင့်ပြုသည်"],
  ["Create the platform for this client company", "为此客户公司创建平台", "ဤ client ကုမ္ပဏီအတွက် platform ဖန်တီးမည်"],
  ["Client company created. Add its first platform next.", "客户公司已创建。接下来请添加第一个平台。", "Client ကုမ္ပဏီ ဖန်တီးပြီး။ နောက်တစ်ဆင့် ပထမဆုံး platform ကို ထည့်ပါ။"],
  ["Platform created. Its Chat, Guide, and Admin links are ready.", "平台已创建，Chat、Guide 和 Admin 链接已可用。", "Platform ဖန်တီးပြီး၊ Chat, Guide နှင့် Admin link များ အသင့်ဖြစ်ပါပြီ။"],
  ["Could not load the Platform Control Center", "无法加载平台控制中心", "Platform Control Center ကို မဖတ်နိုင်ပါ"],
  ["Could not load platform details", "无法加载平台详情", "Platform အသေးစိတ်ကို မဖတ်နိုင်ပါ"],
  ["Platform settings could not be saved", "无法保存平台设置", "Platform ဆက်တင်များကို မသိမ်းနိုင်ပါ"],

  ["Luke provides a neutral white-label hosting layer. Use Luke Shared Hosting when the client does not want to buy a domain. Use Custom Domain when the client wants their own hostname.", "Luke 提供中立的白标托管层。客户不购买域名时使用 Luke Shared Hosting；客户需要自己的主机名时使用 Custom Domain。", "Luke သည် neutral white-label hosting layer ကို ပေးသည်။ Client က domain မဝယ်လိုပါက Luke Shared Hosting ကို သုံးပါ။ Client က မိမိပိုင် hostname လိုပါက Custom Domain ကို သုံးပါ။"],
  ["White-label hosting", "白标托管", "White-label hosting"],
  ["Luke is the neutral hosting layer. Your client's own brand remains visible in Chat, Guide, Staff, and Admin. No provider branding is required for the client experience.", "Luke 是中立的托管层。客户自己的品牌会继续显示在 Chat、Guide、Staff 和 Admin 中，客户体验无需展示服务商品牌。", "Luke သည် neutral hosting layer ဖြစ်သည်။ Client ၏ ကိုယ်ပိုင် brand ကို Chat, Guide, Staff နှင့် Admin တွင် ဆက်လက်ပြမည်။ Client experience အတွက် provider branding မလိုအပ်ပါ။"],
  ["Shared mode requires no client DNS, SSL, or per-client CORS changes. Custom Domain uses the verified Cloudflare workflow below.", "共享模式无需客户配置 DNS、SSL 或逐客户 CORS。Custom Domain 使用下方已验证的 Cloudflare 流程。", "Shared mode တွင် client DNS, SSL သို့မဟုတ် client တစ်ဦးချင်း CORS ပြင်ဆင်မှု မလိုပါ။ Custom Domain သည် အောက်ပါ verified Cloudflare workflow ကို အသုံးပြုသည်။"],
  ["One shared domain set for every client", "所有客户共用一组共享域名", "Client အားလုံးအတွက် shared domain set တစ်ခု"],
  ["The four ar-ai666.com subdomains are configured once. New clients are separated by their immutable /p/<platform-route> path.", "四个 ar-ai666.com 子域名只需配置一次。新客户通过不可变的 /p/<platform-route> 路径进行隔离。", "ar-ai666.com subdomain လေးခုကို တစ်ကြိမ်သာ ပြင်ဆင်ရသည်။ Client အသစ်များကို မပြောင်းလဲသော /p/<platform-route> path ဖြင့် ခွဲထားသည်။"],
  ["Automatic custom-domain API/CORS trust", "自动信任自定义域名 API/CORS", "Custom-domain API/CORS ကို အလိုအလျောက် ယုံကြည်မှု"],
  ["You do not need to add each client domain to Render ALLOWED_ORIGINS. Verified client domains are trusted dynamically after Cloudflare hostname and SSL status become active.", "无需把每个客户域名逐一加入 Render ALLOWED_ORIGINS。Cloudflare 主机名和 SSL 状态生效后，已验证的客户域名会被动态信任。", "Client domain တစ်ခုချင်းစီကို Render ALLOWED_ORIGINS ထဲ ထည့်ရန် မလိုပါ။ Cloudflare hostname နှင့် SSL status active ဖြစ်ပြီးနောက် verified client domain များကို dynamic အဖြစ် ယုံကြည်မည်။"],

  ["Guide Page content is connected live with durable deletion", "指南页面内容已实时连接，并支持持久删除", "Guide Page အကြောင်းအရာသည် live ချိတ်ဆက်ထားပြီး durable deletion ကို ထောက်ပံ့သည်"],
  ["Save publishes immediately. Delete creates a tombstone, so startup defaults cannot recreate the key after refresh or deployment.", "保存后会立即发布。删除会创建 tombstone，因此刷新或重新部署后启动默认值不会重新创建该键。", "Save လုပ်သည်နှင့် ချက်ချင်း publish ဖြစ်မည်။ Delete လုပ်ပါက tombstone ဖန်တီးသဖြင့် refresh သို့မဟုတ် deployment နောက်ပိုင်း startup default က key ကို ပြန်မဖန်တီးနိုင်ပါ။"],
  ["Deleted content key to restore (optional)", "要恢复的已删除内容键（可选）", "ပြန်ယူလိုသော ဖျက်ထားသည့် content key (ရွေးချယ်နိုင်)"],
  ["Restore deleted key", "恢复已删除的键", "ဖျက်ထားသော key ကို ပြန်ယူမည်"],

  ["One label and action for the active platform. The same button is used in every customer language.", "为当前平台配置一套标签和操作。所有客户语言都使用同一个按钮。", "Active platform အတွက် label နှင့် action တစ်စုံကို သတ်မှတ်သည်။ Customer ဘာသာစကားအားလုံးတွင် တူညီသော button ကို အသုံးပြုမည်။"],
  ["Global label contract", "全局标签规则", "Global label စည်းမျဉ်း"],
  ["Localized Hindi and other per-language labels are retired. Configure one clear label for all customers.", "已停用 Hindi 等按语言分别配置的标签。请为所有客户配置一个清晰的统一标签。", "Hindi နှင့် အခြား ဘာသာစကားအလိုက် label များကို ရပ်ထားသည်။ Customer အားလုံးအတွက် ရှင်းလင်းသော label တစ်ခုကို သတ်မှတ်ပါ။"],
  ["New button", "新建按钮", "Button အသစ်"],
  ["Button", "按钮", "Button"],
  ["Optional subtitle", "可选副标题", "Subtitle (ရွေးချယ်နိုင်)"],
  ["Action type", "操作类型", "Action type"],
  ["URL or action", "URL 或操作", "URL သို့မဟုတ် action"],
  ["Same window", "当前窗口", "လက်ရှိ window"],
  ["New window", "新窗口", "window အသစ်"],
  ["Icon URL", "图标 URL", "Icon URL"],

  ["Messages where Prompt-First AI did not select a high-confidence content item. Use these to improve AI Prompt Manager and AI Prompt & Image examples.", "这里列出 Prompt-First AI 未能选择高置信度内容项的消息。可利用这些记录改进 AI Prompt Manager 以及 AI Prompt & Image 示例。", "Prompt-First AI က high-confidence content item မရွေးနိုင်ခဲ့သော message များကို ဤနေရာတွင် ပြသည်။ AI Prompt Manager နှင့် AI Prompt & Image example များကို တိုးတက်စေရန် အသုံးပြုပါ။"],
  ["Message", "消息", "Message"],
  ["Suggested intent", "建议意图", "အကြံပြု intent"],

  ["Search session, message, reply, model...", "搜索会话、消息、回复、模型...", "Session, message, reply, model ကို ရှာပါ..."],
  ["Chat logs could not be loaded", "无法加载聊天记录", "Chat မှတ်တမ်းများကို မဖတ်နိုင်ပါ"],
  ["No customer message recorded", "没有记录客户消息", "ဖောက်သည် message မှတ်တမ်းမရှိပါ"],
  ["Degraded", "降级", "Degraded"],
  ["Memory reset", "记忆已重置", "Memory reset"],
  ["Import batch", "导入批次", "Import batch"],
  ["Compiled Prompt SHA-256", "已编译 Prompt SHA-256", "Compiled Prompt SHA-256"],
  ["Rich response", "富响应", "Rich response"],
  ["Resolution", "解决状态", "ဖြေရှင်းမှု"],

  ["Owner can change email, create admins, disable users, and reset passwords.", "所有者可以修改邮箱、创建管理员、停用用户并重置密码。", "Owner သည် email ပြောင်းခြင်း၊ admin ဖန်တီးခြင်း၊ user ပိတ်ခြင်းနှင့် password reset လုပ်ခြင်းတို့ ပြုလုပ်နိုင်သည်။"],
  ["Owner (protected, only first owner remains owner)", "Owner（受保护，仅首个 Owner 保持 Owner 身份）", "Owner (ကာကွယ်ထားပြီး ပထမ owner သာ owner အဖြစ် ဆက်ရှိမည်)"],

  ["Guide appearance", "指南外观", "Guide အသွင်အပြင်"],
  ["Visual settings are independent from Chat. Language content below is generated from Platform Settings, so supported Guide languages always follow the platform.", "视觉设置与 Chat 相互独立。下方语言内容由 Platform Settings 生成，因此 Guide 支持的语言始终跟随平台设置。", "Visual ဆက်တင်များသည် Chat နှင့် သီးခြားဖြစ်သည်။ အောက်ပါ ဘာသာစကားအကြောင်းအရာများကို Platform Settings မှ ထုတ်ယူသဖြင့် Guide ပံ့ပိုးသော ဘာသာစကားများသည် platform ကို အမြဲလိုက်မည်။"],
  ["Add/remove supported languages or change the default language in Platform Control Center. This editor follows that list automatically. Removing a language from the platform hides it; saved translation values are retained.", "可在 Platform Control Center 添加/移除支持语言或修改默认语言。此编辑器会自动跟随该列表。从平台移除某种语言只会隐藏它，已保存的翻译仍会保留。", "Platform Control Center တွင် supported language များ ထည့်/ဖယ် သို့မဟုတ် default language ပြောင်းနိုင်သည်။ ဤ editor သည် အဆိုပါစာရင်းကို အလိုအလျောက် လိုက်နာသည်။ Platform မှ language ဖယ်ပါက ဖျောက်ထားမည်သာဖြစ်ပြီး သိမ်းထားသော translation value များ ဆက်ရှိမည်။"],

  ["Something went wrong on our end. You can try refreshing or head back home.", "系统出现问题。你可以尝试刷新页面或返回首页。", "စနစ်ဘက်တွင် အမှားတစ်ခု ဖြစ်ပွားသည်။ Refresh လုပ်ပါ သို့မဟုတ် ပင်မစာမျက်နှာသို့ ပြန်သွားပါ။"],
];

for (const [en, zh, my] of extra) {
  EXACT.en.set(en, en);
  EXACT["zh-CN"].set(en, zh);
  EXACT["my-MM"].set(en, my);
}
