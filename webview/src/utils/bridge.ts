const BRIDGE_UNAVAILABLE_WARNED = new Set<string>();

const callBridge = (payload: string) => {
  if (window.sendToJava) {
    window.sendToJava(payload);
    return true;
  }
  if (!BRIDGE_UNAVAILABLE_WARNED.has(payload)) {
    console.warn('[Claude Bridge] sendToJava not available. payload=', payload);
    BRIDGE_UNAVAILABLE_WARNED.add(payload);
  }
  return false;
};

export const sendBridgeEvent = (event: string, content = '') => {
  callBridge(`${event}:${content}`);
};

export const openFile = (filePath?: string) => {
  if (!filePath) {
    return;
  }
  sendBridgeEvent('open_file', filePath);
};

export const openBrowser = (url?: string) => {
  if (!url) {
    return;
  }
  sendBridgeEvent('open_browser', url);
};

export const getProjectRootPath = (): Promise<string> => {
  return new Promise((resolve) => {
    // 设置回调
    window.onProjectRootPathReceived = (path: string) => {
      resolve(path);
      // 清理回调，避免内存泄漏
      delete window.onProjectRootPathReceived;
    };

    // 发送请求
    sendBridgeEvent('get_project_root_path');

    // 超时处理
    setTimeout(() => {
      if (window.onProjectRootPathReceived) {
        delete window.onProjectRootPathReceived;
        resolve('');
      }
    }, 5000);
  });
};

