import { ExchangeStatus } from './exchange';
import { ItemStatus } from './item';

export const PAGE_MESSAGES = {
  homeEmpty: '暂时没有符合条件的闲置物品',
  publishReady: '发布后会同步写入 localStorage 和 IndexedDB',
  exchangeEmpty: '还没有交换请求，先去首页挑一件合眼缘的物品',
  profileUpdated: '个人资料已更新',
};

export const REVIEW_MESSAGES = {
  reviewSubmitted: '评价已提交，对方评价后双方内容将同时公开',
  reviewRevealed: '双方均已评价，两条评价已同时公开，信用分已更新',
  reviewFailed: '评价提交失败，请稍后重试',
  reviewWaiting: '你已评价，等待对方提交后公开内容',
  reviewPending: '交换已完成，请给对方本次交换打星并选择标签',
  reviewReadOnly: '本次交换评价已公开',
  ratingRequired: '请先选择 1~5 星',
  tagRequired: '请至少选择一个评价标签',
  reviewUnavailable: '仅交换参与者本人可在交换完成后评价',
};

export const FORM_MESSAGES = {
  requiredTitle: '物品标题不能为空',
  requiredDescription: '请描述你希望交换的物品',
  requiredPhone: '请填写联系方式',
  imageLimit: '最多上传 4 张图片',
  exchangeNeedOwnItem: '请先发布一件可交换物品',
};

export const LOG_MESSAGES = {
  storageHydrated: 'storage hydrated with status maps',
  itemStatusUsed: `ItemStatus includes ${ItemStatus.AVAILABLE}, ${ItemStatus.EXCHANGED}, ${ItemStatus.OFFLINE}`,
  exchangeStatusUsed: `ExchangeStatus includes ${ExchangeStatus.PENDING}, ${ExchangeStatus.ACCEPTED}, ${ExchangeStatus.REJECTED}, ${ExchangeStatus.COMPLETED}`,
};

export const STATUS_MESSAGE_MAP = {
  [ItemStatus.AVAILABLE]: '这件物品可发起交换',
  [ItemStatus.EXCHANGED]: '这件物品已完成交换',
  [ItemStatus.OFFLINE]: '这件物品已下架',
  [ExchangeStatus.PENDING]: '等待对方确认',
  [ExchangeStatus.ACCEPTED]: '交换已同意，可确认完成',
  [ExchangeStatus.REJECTED]: '交换请求已拒绝',
  [ExchangeStatus.COMPLETED]: '交换流程已完成',
};
