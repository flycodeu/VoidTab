/**
 * 浏览器兼容性工具
 * 提供统一的浏览器API访问和Edge兼容性支持
 */

// 统一的浏览器API访问（支持Chrome和Edge）
export const browserAPI = (globalThis as any).chrome || (globalThis as any).browser;

/**
 * 检测当前浏览器类型
 */
export const detectBrowser = (): 'chrome' | 'edge' | 'firefox' | 'safari' | 'unknown' => {
  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('chrome') && !ua.includes('edg')) return 'chrome';
  if (ua.includes('firefox')) return 'firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'safari';

  return 'unknown';
};

/**
 * 检测是否为Edge浏览器
 */
export const isEdge = (): boolean => {
  return detectBrowser() === 'edge';
};

/**
 * Promise化的Chrome存储API（Edge兼容）
 */
export const storage = {
  /**
   * 从存储中获取数据
   */
  get: (keys: string | string[] | null = null): Promise<any> => {
    return new Promise((resolve, reject) => {
      try {
        browserAPI.storage.local.get(keys, (result: any) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 保存数据到存储
   */
  set: (items: Record<string, any>): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        browserAPI.storage.local.set(items, () => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 从存储中移除数据
   */
  remove: (keys: string | string[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        browserAPI.storage.local.remove(keys, () => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 清空所有存储数据
   */
  clear: (): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        browserAPI.storage.local.clear(() => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 获取存储使用情况（字节）
   */
  getBytesInUse: (keys: string | string[] | null = null): Promise<number> => {
    return new Promise((resolve, reject) => {
      try {
        browserAPI.storage.local.getBytesInUse(keys, (bytes: number) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve(bytes);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },
};

/**
 * Promise化的Runtime API
 */
export const runtime = {
  /**
   * 发送消息到后台脚本
   */
  sendMessage: (message: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      try {
        browserAPI.runtime.sendMessage(message, (response: any) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 获取扩展的URL
   */
  getURL: (path: string): string => {
    return browserAPI.runtime.getURL(path);
  },

  /**
   * 获取Manifest信息
   */
  getManifest: (): chrome.runtime.Manifest => {
    return browserAPI.runtime.getManifest();
  },
};

/**
 * 检测是否在扩展环境中运行
 */
export const isExtensionContext = (): boolean => {
  try {
    return !!(browserAPI && browserAPI.runtime && browserAPI.runtime.id);
  } catch {
    return false;
  }
};

/**
 * 获取浏览器版本信息
 */
export const getBrowserInfo = (): { name: string; version: string } => {
  const ua = navigator.userAgent;
  const browser = detectBrowser();

  let version = 'unknown';

  if (browser === 'edge') {
    const match = ua.match(/Edg\/(\d+\.\d+)/);
    version = match ? match[1] : 'unknown';
  } else if (browser === 'chrome') {
    const match = ua.match(/Chrome\/(\d+\.\d+)/);
    version = match ? match[1] : 'unknown';
  } else if (browser === 'firefox') {
    const match = ua.match(/Firefox\/(\d+\.\d+)/);
    version = match ? match[1] : 'unknown';
  }

  return { name: browser, version };
};

/**
 * Edge特定的功能检测
 */
export const edgeFeatures = {
  /**
   * 检测是否支持特定的Edge功能
   */
  supportsFeature: (feature: string): boolean => {
    if (!isEdge()) return false;

    // 可以根据需要添加更多特性检测
    const features: Record<string, boolean> = {
      'sidebar': true,
      'collections': true,
    };

    return features[feature] ?? false;
  },
};

export default {
  browserAPI,
  detectBrowser,
  isEdge,
  storage,
  runtime,
  isExtensionContext,
  getBrowserInfo,
  edgeFeatures,
};
