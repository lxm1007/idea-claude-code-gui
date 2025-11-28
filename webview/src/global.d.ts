import type { HistoryData } from './types';

declare global {
  interface Window {
    sendToJava?: (payload: string) => void;
    updateMessages?: (json: string) => void;
    updateStatus?: (status: string) => void;
    showLoading?: (show: boolean | string) => void;
    setHistoryData?: (data: HistoryData) => void;
    clearMessages?: () => void;
    addErrorMessage?: (message: string) => void;
    addSelectionInfo?: (info: string) => void;
    handleDroppedFiles?: (paths: string[]) => void;
    // 配置相关
    updateProviders?: (jsonStr: string) => void;
    updateActiveProvider?: (jsonStr: string) => void;
    showError?: (message: string) => void;
    updateUsageStatistics?: (jsonStr: string) => void;
    // 项目路径
    onProjectRootPathReceived?: (path: string) => void;
    // 文件列表和命令列表
    onFileListResult?: (json: string) => void;
    onCommandListResult?: (json: string) => void;
    // 用量统计回调
    onUsageUpdate?: (json: string) => void;
    onModeChanged?: (mode: string) => void;
    onModelChanged?: (modelId: string) => void;
  }
}

export {};

