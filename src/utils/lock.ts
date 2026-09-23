// 进程内互斥锁 + 可选的 Web Locks API 跨标签页锁。
// 评价提交要求“评价、公开状态、信用分要么一起成功，要么全部不变”，
// 且重复 / 并发 / 刷新重放都不能多写，因此所有结算写入都必须在锁内完成。

const inPageTails = new Map<string, Promise<unknown>>();

// 同名下的任务通过 then 串成一条链：前一个任务 settle 之后下一个才开始。
const runInPageLock = <T>(name: string, task: () => Promise<T>): Promise<T> => {
  const previous = inPageTails.get(name) ?? Promise.resolve();
  const result = previous.then(
    () => task(),
    // 前一个任务失败不应阻塞链上后来者拿到锁。
    () => task(),
  );
  // 链尾记录“任务已结束”的 Promise（吞掉异常），避免失败结果在链上传播。
  inPageTails.set(
    name,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
};

type LockishNavigator = Navigator & {
  locks?: {
    request: <T>(name: string, options?: { mode?: 'exclusive' }, callback?: () => Promise<T> | T) => Promise<T>;
  };
};

// 优先使用浏览器原生 Web Locks（跨标签页互斥）；不支持时退化为单页内队列。
export const runWithLock = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
  const lockName = `reswap-lock:${name}`;
  const locksNavigator = navigator as LockishNavigator;
  if (locksNavigator.locks?.request) {
    return locksNavigator.locks.request(lockName, () => runInPageLock(name, task));
  }
  return runInPageLock(name, task);
};
