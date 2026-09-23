# ReSwap 二手闲置物品交换平台

```bash
pnpm install
pnpm dev
```

访问地址：`http://localhost:18415`

## 项目介绍

ReSwap 是一个纯前端以物换物 Web 应用。用户可以本地模拟登录、发布闲置物品、浏览他人物品、发起交换请求，并在浏览器内管理交换记录。

## 主要功能

- 首页瀑布流浏览、分类筛选、关键词搜索。
- 物品详情、物主资料、选择自己的物品发起交换。
- 发布物品，支持本地 base64 图片上传、分类和成色选择。
- 交换管理，区分我发起的和我收到的请求，支持同意、拒绝、完成。
- **交换完成后双方互评**：各评一次，填 1~5 星和标签；仅参与者本人、交换已完成时可提交，对象固定为对方。
  - 提交后本人看到“已评价”，**双方都提交前对方看不到任何评价内容**；双方提交后两条评价**同时公开**。
  - 信用分联动：5 星 +3、4 星 +1、3 星不变、2 星 -1、1 星 -3，信用分限制在 0~100。
  - 每笔交换每人只改一次：重复提交、并发连点、多标签页同时提交、刷新重放都不会多写。
  - 评价、公开状态、信用分在同一存储事务内提交，**要么一起成功，要么全部不变**。
- 个人中心，编辑资料、上传头像、查看我发布的物品。
- 主题切换、全局错误处理和 Vant 提示。

## 启动与构建

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
```

生产部署：执行 `pnpm build` 后，将 `dist/` 目录交给 Nginx 或任意静态文件服务器托管。

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| UI | Vant + Tailwind CSS |
| 持久化 | localStorage + IndexedDB（idb-keyval） |
| 工具库 | dayjs、lodash-es |

## 项目目录结构

```text
src/
├── api/              # userApi.ts, itemApi.ts, exchangeApi.ts, reviewApi.ts：本地数据 API 层
├── stores/           # authStore.ts, itemStore.ts, exchangeStore.ts, reviewStore.ts, themeStore.ts
├── models/           # user.ts, item.ts, exchange.ts, review.ts：独立数据模型
├── types/            # 共享类型补充
├── components/common/# ItemCard、ExchangeCard、ExchangeReview、ReviewContent 等共享组件与 GlobalErrorBoundary
├── hooks/            # useAuth.ts, useLocalStorage.ts, useExchangeStats.ts
├── pages/            # Home, ItemDetail, Publish, Exchanges, Profile
├── router/           # index.ts + guards.ts
├── utils/            # storage.ts（含多 key 事务/锁）, lock.ts, review.ts, formatters.ts, validators.ts, message.ts, themeUtils.ts
├── constants/        # item.ts, exchange.ts, review.ts, themes.ts, messages.ts
├── App.vue
├── main.ts
└── styles.css
```

## 数据持久化说明

- `utils/storage.ts` 统一封装 localStorage 和 IndexedDB。
- 所有 `api/*Api.ts` 通过 `storage.ts` 读写数据，不在组件里直接写业务数据。
- 存储层包含序列化、版本号、过期清理、存储 key 管理。
- `storage.transaction()` 在跨标签页锁（Web Locks API，不支持时退化为页内队列）内对多个 key 做读-改-写，写入失败会按快照整体回滚；互评的“评价 + 公开状态 + 信用分”即通过它原子提交。
- 首次启动会写入演示用户、物品、交换请求（含一笔待互评、一笔已互评的已完成交换）和评价。

## 互评规则与一致性保证

| 规则 | 实现位置 |
| --- | --- |
| 双方各评一次、1~5 星 + 标签 | `models/review.ts`、`constants/review.ts`、`components/common/ExchangeReview.vue` |
| 仅参与者本人、交换已完成、对象固定为对方 | `api/reviewApi.ts`（事务内权威校验）、`utils/validators.ts`（表单预校验） |
| 双方提交前互相不可见，双方提交后同时公开 | `stores/reviewStore.ts` 的 `visibility` getter、`components/common/ExchangeReview.vue` |
| 5★+3 / 4★+1 / 3★0 / 2★-1 / 1★-3，限制 0~100 | `constants/review.ts` 的 `REVIEW_CREDIT_DELTA`、`utils/review.ts` |
| 每人每笔只写一次，重复 / 并发 / 刷新重放不多写 | `storage.transaction` + `utils/lock.ts` 双重锁，`api/reviewApi.ts` 的已存在闸门 |
| 评价、公开状态、信用分原子提交 | `utils/storage.ts` 的 `transaction`（快照 + 失败回滚） |

核心规则验证脚本（纯前端，使用内存版 localStorage / IndexedDB / Web Locks）：

```bash
node scripts/run-review-tests.cjs   # 权限、公开时机、信用分、幂等、并发
node scripts/run-atomic-test.cjs    # 写入失败整体回滚
```

## 横切关注点

- 主题切换：`stores/themeStore.ts`、`constants/themes.ts`、`utils/themeUtils.ts`、`App.vue`、`components/common/CategoryFilter.vue`、`components/common/UserBrief.vue`、`components/common/ItemCard.vue`。
- 全局错误处理/提示：`utils/message.ts`、`components/common/GlobalErrorBoundary.tsx`、`stores/authStore.ts`、`stores/itemStore.ts`、`stores/exchangeStore.ts`、`components/common/ImageUploader.vue`。

## 枚举出现位置清单

### ItemStatus

定义位置：`src/constants/item.ts`

出现位置：

- `src/models/item.ts`
- `src/constants/messages.ts`
- `src/api/itemApi.ts`
- `src/api/exchangeApi.ts`
- `src/stores/itemStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/components/common/ItemCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Publish.vue`
- `src/pages/Profile.vue`

### ExchangeStatus

定义位置：`src/constants/exchange.ts`

出现位置：

- `src/models/exchange.ts`
- `src/constants/messages.ts`
- `src/api/exchangeApi.ts`
- `src/stores/exchangeStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/hooks/useExchangeStats.ts`
- `src/components/common/ExchangeCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Exchanges.vue`

### 互评常量（ReviewRating / REVIEW_CREDIT_DELTA / REVIEW_TAG_OPTIONS）

定义位置：`src/constants/review.ts`

出现位置：

- `src/models/review.ts`
- `src/api/reviewApi.ts`
- `src/stores/reviewStore.ts`
- `src/utils/review.ts`（信用分增量与 0~100 裁剪）
- `src/utils/formatters.ts`（星级与信用分变化文本）
- `src/utils/validators.ts`（星级/标签表单校验）
- `src/constants/messages.ts`（互评提示文案）
- `src/components/common/ExchangeReview.vue`
- `src/components/common/ReviewContent.vue`
- `src/components/common/ExchangeCard.vue`
- `src/pages/Exchanges.vue`

## 分层与高耦合约束

本项目保留提示词要求的“严禁合并职责到单一文件”：模型、常量、API、store、页面、组件、hooks、utils 均独立拆分。

同时保留“屎山代码设计要求”的低内聚高耦合特征：

- `utils/formatters.ts` 同时负责日期、物品状态、交换状态、成色、信用等级文本。
- `constants/messages.ts` 同时包含页面提示、表单校验、日志式文案和状态文案。
- `ItemStatus` 与 `ExchangeStatus` 被模型、API、store、组件、页面、router guards、formatters 多处引用。
- `utils/storage.ts` 是存储入口，但全应用 API 和 store 都依赖它的 key 与数据结构。

例如新增 `ItemStatus.BOOKED` 时，应至少修改：`src/constants/item.ts`、`src/models/item.ts`、`src/api/itemApi.ts`、`src/api/exchangeApi.ts`、`src/stores/itemStore.ts`、`src/router/guards.ts`、`src/utils/formatters.ts`、`src/constants/messages.ts`、`src/components/common/ItemCard.vue`、`src/pages/ItemDetail.vue`、`src/pages/Publish.vue` 等文件。

## 环境变量

当前项目无必需环境变量。

## License

MIT
