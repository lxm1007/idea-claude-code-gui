import { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownBlock from './components/MarkdownBlock';
import HistoryView from './components/history/HistoryView';
import SettingsView from './components/SettingsView';
import ConfirmDialog from './components/ConfirmDialog';
import {
  BashToolBlock,
  EditToolBlock,
  GenericToolBlock,
  ReadToolBlock,
  TaskExecutionBlock,
  TodoListBlock,
} from './components/toolBlocks';
import { BackIcon, ClawdIcon, SendIcon, StopIcon } from './components/Icons';
import type {
  ClaudeContentBlock,
  ClaudeMessage,
  ClaudeRawMessage,
  HistoryData,
  TodoItem,
  ToolResultBlock,
} from './types';
import { getProjectRootPath } from './utils/bridge';

type ViewMode = 'chat' | 'history' | 'settings';

const DEFAULT_STATUS = '就绪';

const isTruthy = (value: unknown) => value === true || value === 'true';

const sendBridgeMessage = (event: string, payload = '') => {
  if (window.sendToJava) {
    window.sendToJava(`${event}:${payload}`);
  } else {
    console.warn('[Frontend] sendToJava is not ready yet');
  }
};

const App = () => {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [loading, setLoading] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [currentView, setCurrentView] = useState<ViewMode>('chat');
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
  const [historyNavigator, setHistoryNavigator] = useState<{
    isVisible: boolean;
    messageIndex: number;
    messageText: string;
  } | null>(null);
  const [projectRootPath, setProjectRootPath] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    window.updateMessages = (json) => {
      try {
        const parsed = JSON.parse(json) as ClaudeMessage[];
        setMessages(parsed);
      } catch (error) {
        console.error('[Frontend] Failed to parse messages:', error);
      }
    };

    window.updateStatus = (text) => setStatus(text);
    window.showLoading = (value) => setLoading(isTruthy(value));
    window.setHistoryData = (data) => setHistoryData(data);
    window.clearMessages = () => setMessages([]);
    window.addErrorMessage = (message) =>
      setMessages((prev) => [...prev, { type: 'error', content: message }]);
    window.addSelectionInfo = (info) => {
      // info 格式: @path/to/file#Lstart-end 或 @path/to/file#Lline
      setInputMessage((prev) => {
        const codeBlock = `\n${info}\n`;
        return prev + codeBlock;
      });

      setTimeout(() => {
        if (inputRef.current) {
          // 计算光标位置：定位到新行开始（第二个换行符后）
          const len = inputRef.current.value.length;
          const cursorPos = len; // 定位到新行开始
          inputRef.current.focus();
          inputRef.current.setSelectionRange(cursorPos, cursorPos);
        }
      }, 100);
    };
    
    // 处理从 Java 端拖拽的文件
    window.handleDroppedFiles = (paths: string[]) => {
      console.log('[Frontend] 收到拖拽文件:', paths);
      if (paths && paths.length > 0) {
        const formattedPaths = paths.map(p => p.startsWith('@') ? p : '@' + p);
        const pathsText = formattedPaths.join('\n') + '\n';
        setInputMessage((prev) => prev + pathsText);
        
        setTimeout(() => {
          if (inputRef.current) {
            const len = inputRef.current.value.length;
            inputRef.current.focus();
            inputRef.current.setSelectionRange(len, len);
          }
        }, 100);
      }
    };
  }, []);

  // 获取项目根路径
  useEffect(() => {
    const loadProjectRootPath = async () => {
      try {
        const rootPath = await getProjectRootPath();
        if (rootPath) {
          setProjectRootPath(rootPath);
          console.log('[Frontend] 项目根路径:', rootPath);
        }
      } catch (error) {
        console.error('[Frontend] 获取项目根路径失败:', error);
      }
    };

    loadProjectRootPath();
  }, []);

  useEffect(() => {
    if (currentView !== 'history') {
      return;
    }

    const requestHistoryData = () => {
      if (window.sendToJava) {
        sendBridgeMessage('load_history_data');
      } else {
        setTimeout(requestHistoryData, 100);
      }
    };

    const timer = setTimeout(requestHistoryData, 50);
    return () => clearTimeout(timer);
  }, [currentView]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }
    const textarea = inputRef.current;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    textarea.scrollTop = textarea.scrollHeight;
  }, [inputMessage]);

  const interruptSession = () => {
    sendBridgeMessage('interrupt_session');
    setStatus('已发送中断请求');
  };

  // const restartSession = () => {
  //   if (window.confirm('确定要重启会话吗？这将清空当前对话历史。')) {
  //     sendBridgeMessage('restart_session');
  //     setMessages([]);
  //     setStatus('正在重启会话...');
  //   }
  // };

  const createNewSession = () => {
    if (messages.length === 0) {
      setStatus('当前会话为空，可以直接使用');
      return;
    }
    setShowNewSessionConfirm(true);
  };

  const handleConfirmNewSession = () => {
    setShowNewSessionConfirm(false);
    sendBridgeMessage('create_new_session');
    setMessages([]);
    setStatus('正在创建新会话...');
  };

  const handleCancelNewSession = () => {
    setShowNewSessionConfirm(false);
  };

  // 递归获取文件和文件夹路径
  const getDroppedItems = async (dataTransfer: DataTransfer): Promise<string[]> => {
    const paths: string[] = [];
    const fileList = Array.from(dataTransfer.files);

    // 检查是否支持webkitGetAsEntry (用于检测文件夹)
    const hasWebkit = 'webkitGetAsEntry' in File.prototype;

    if (hasWebkit && dataTransfer.items && dataTransfer.items.length > 0) {
      const processEntry = async (entry: FileSystemEntry, path: string = ''): Promise<void> => {
        if (entry.isFile) {
          const file = await new Promise<File>((resolve) => {
            (entry as FileSystemFileEntry).file(resolve);
          });

          // 计算相对路径
          let relativePath = '';
          if (projectRootPath && file.webkitRelativePath) {
            relativePath = `@${file.webkitRelativePath}`;
          } else if (file.webkitRelativePath) {
            relativePath = `@${file.webkitRelativePath}`;
          } else {
            relativePath = `@${path}${file.name}`;
          }

          paths.push(relativePath);
        } else if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry;
          paths.push(`@${path}${dirEntry.name}/`);
          const reader = dirEntry.createReader();
          const readEntries = (): Promise<FileSystemEntry[]> => {
            return new Promise((resolve) => {
              reader.readEntries(resolve);
            });
          };
          const entries = await readEntries();
          for (const childEntry of entries) {
            await processEntry(childEntry, `${path}${dirEntry.name}/`);
          }
        }
      };

      const promises = Array.from(dataTransfer.items)
        .filter(item => 'webkitGetAsEntry' in item)
        .map(item => {
          const entry = (item as any).webkitGetAsEntry();
          if (entry) {
            return processEntry(entry);
          }
          return Promise.resolve();
        });

      await Promise.all(promises);
    } else {
      // 降级方案：只处理文件
      fileList.forEach(file => {
        let relativePath = '';
        if (projectRootPath && file.webkitRelativePath) {
          relativePath = `@${file.webkitRelativePath}`;
        } else if (file.webkitRelativePath) {
          relativePath = `@${file.webkitRelativePath}`;
        } else {
          relativePath = `@${file.name}`;
        }
        paths.push(relativePath);
      });
    }

    return paths;
  };

  // 处理文件拖拽
  const handleFileDrop = (event: React.DragEvent) => {
    console.log('[Drag] drop event triggered!');
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    
    console.log('[Drag] files:', event.dataTransfer.files.length);
    console.log('[Drag] items:', event.dataTransfer.items?.length);
    console.log('[Drag] types:', event.dataTransfer.types);
    
    getDroppedItems(event.dataTransfer).then(filePaths => {
      console.log('[Drag] filePaths:', filePaths);
      if (filePaths.length > 0) {
        const pathsText = filePaths.join('\n') + '\n';
        setInputMessage((prev) => prev + pathsText);
        
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 50);
      }
    }).catch(error => {
      console.error('[Drag] error:', error);
    });
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    console.log('[Drag] dragover');
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
    console.log('[Drag] dragenter');
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragging(false);
    }
    console.log('[Drag] dragleave');
  };

  // 清理消息内容
  const cleanMessageForSending = (text: string): string => {
    return text.trim();
  };

  // 发送消息
  const sendMessage = () => {
    const message = inputMessage.trim();
    if (!message || loading) {
      return;
    }

    // 清理消息，移除代码块标记
    const cleanedMessage = cleanMessageForSending(message);
    if (!cleanedMessage) {
      return;
    }

    sendBridgeMessage('send_message', cleanedMessage);
    setInputMessage('');
  };

  const toggleThinking = (messageIndex: number, blockIndex: number) => {
    const key = `${messageIndex}_${blockIndex}`;
    setExpandedThinking((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isThinkingExpanded = (messageIndex: number, blockIndex: number) =>
    Boolean(expandedThinking[`${messageIndex}_${blockIndex}`]);

  // 查找路径的范围（所有 @ 路径：代码块、文件、目录）
  const findCodeBlockRange = (text: string, cursorPosition: number): { start: number; end: number } | null => {
    const lines = text.split('\n');
    let currentPos = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测所有路径：@path/file#Lstart-Lend、@path/file、@path/dir/
      if (line.match(/^@\S+/)) {
        // 路径开始位置（包括前面的换行符，如果有的话）
        const blockStart = i > 0 ? currentPos - 1 : currentPos;

        // 路径结束位置（整行，包括换行符）
        const blockEnd = currentPos + line.length;

        // 检查光标是否在当前路径范围内
        if (cursorPosition >= blockStart && cursorPosition <= blockEnd) {
          return { start: blockStart, end: blockEnd };
        }
      }

      currentPos += line.length + 1; // +1 for newline
    }

    return null;
  };

  const handleKeydown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const cursorPosition = textarea.selectionStart;
    const text = textarea.value;

    // 处理 Backspace 或 Delete 键 - 保护代码块整体性
    if (event.key === 'Backspace' || event.key === 'Delete') {
      const codeBlockRange = findCodeBlockRange(text, cursorPosition);
      if (codeBlockRange) {
        // 检查是否正在删除代码块的一部分
        const selectionStart = textarea.selectionStart;
        const selectionEnd = textarea.selectionEnd;

        // 如果选中范围在代码块内，或者删除操作会影响代码块
        if (
          (selectionStart === selectionEnd &&
           (selectionStart > codeBlockRange.start && selectionStart <= codeBlockRange.end)) ||
          (selectionStart < codeBlockRange.end && selectionEnd > codeBlockRange.start)
        ) {
          event.preventDefault();
          // 删除整个代码块（包括前后的换行）
          const beforeBlock = text.substring(0, codeBlockRange.start);
          const afterBlock = text.substring(codeBlockRange.end);

          // 清理前后的多余换行
          const cleanedBefore = beforeBlock.replace(/\n+$/, '');
          const cleanedAfter = afterBlock.replace(/^\n+/, '');
          const newText = cleanedBefore + (cleanedBefore && cleanedAfter ? '\n' : '') + cleanedAfter;

          setInputMessage(newText);

          // 设置光标位置
          setTimeout(() => {
            if (textarea) {
              const newCursorPos = cleanedBefore.length + (cleanedBefore && cleanedAfter ? 1 : 0);
              textarea.setSelectionRange(newCursorPos, newCursorPos);
            }
          }, 0);
          return;
        }
      }
    }

    // Ctrl/Cmd + 上方向键：浏览上一条历史消息
    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowUp') {
      event.preventDefault();
      navigateHistory(-1);
      return;
    }
    // Ctrl/Cmd + 下方向键：浏览下一条历史消息
    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowDown') {
      event.preventDefault();
      navigateHistory(1);
      return;
    }
    // Enter 发送消息
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  // 导航历史消息（Ctrl+↑/↓）
  const navigateHistory = (direction: number) => {
    const userMessages = messages
      .map((msg, idx) => ({ msg, idx }))
      .filter(({ msg }) => msg.type === 'user');

    if (userMessages.length === 0) {
      return;
    }

    if (!historyNavigator) {
      // 第一次使用，从最后一条消息开始
      const lastUserMsg = userMessages[userMessages.length - 1];
      const text = getMessageText(lastUserMsg.msg);
      setHistoryNavigator({
        isVisible: true,
        messageIndex: lastUserMsg.idx,
        messageText: text,
      });
      setInputMessage(text);
      return;
    }

    // 找到当前消息在用户消息列表中的位置
    const currentIndexInUserMessages = userMessages.findIndex(
      ({ idx }) => idx === historyNavigator.messageIndex
    );

    const newIndex = currentIndexInUserMessages + direction;

    if (newIndex >= 0 && newIndex < userMessages.length) {
      const targetMessage = userMessages[newIndex];
      const text = getMessageText(targetMessage.msg);
      setHistoryNavigator({
        isVisible: true,
        messageIndex: targetMessage.idx,
        messageText: text,
      });
      setInputMessage(text);
    } else if (newIndex < 0) {
      // 到达最旧的消息
      setHistoryNavigator(null);
      setInputMessage('');
    }
  };

  // 重新发送消息（将消息内容填入输入框）
  const resendMessage = (message: ClaudeMessage) => {
    const text = getMessageText(message);
    setInputMessage(text);
    setHistoryNavigator(null);
    // 聚焦输入框
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  // 取消历史导航
  const cancelHistoryNavigator = () => {
    setHistoryNavigator(null);
    setInputMessage('');
  };

  const loadHistorySession = (sessionId: string) => {
    sendBridgeMessage('load_session', sessionId);
    setCurrentView('chat');
  };

  const getMessageText = (message: ClaudeMessage) => {
    if (message.content) {
      return message.content;
    }
    const raw = message.raw;
    if (!raw) {
      return '(空消息)';
    }
    if (typeof raw === 'string') {
      return raw;
    }
    if (typeof raw.content === 'string') {
      return raw.content;
    }
    if (Array.isArray(raw.content)) {
      return raw.content
        .filter((block) => block && block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n');
    }
    if (raw.message?.content && Array.isArray(raw.message.content)) {
      return raw.message.content
        .filter((block) => block && block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n');
    }
    return '(空消息)';
  };

  // 解析输入内容，识别代码块路径和文件路径
  const parseInputContent = (content: string) => {
    const lines = content.split('\n');
    const result: Array<{ type: 'codeblock' | 'file' | 'directory' | 'text'; text: string; key: string }> = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // 代码块路径格式：@path/to/file#L1-L10 或 @path/to/file#L1
      if (line.match(/^@\S+#L\d+/)) {
        result.push({
          type: 'codeblock' as const,
          text: line,
          key: `codeblock-${index}`,
        });
        continue;
      }

      // 文件路径格式：@path/to/file 或 @path/to/dir/
      if (line.startsWith('@')) {
        const isDirectory = line.endsWith('/');
        result.push({
          type: (isDirectory ? 'directory' : 'file') as 'directory' | 'file',
          text: line,
          key: `file-${index}`,
        });
        continue;
      }

      result.push({
        type: 'text' as const,
        text: line,
        key: `text-${index}`,
      });
    }

    return result;
  };

  const shouldShowMessage = (message: ClaudeMessage) => {
    if (message.type === 'assistant') {
      return true;
    }
    if (message.type === 'user' || message.type === 'error') {
      const text = getMessageText(message);
      return Boolean(text && text.trim() && text !== '(空消息)');
    }
    return true;
  };

  const normalizeBlocks = (raw?: ClaudeRawMessage | string) => {
    if (!raw) {
      return null;
    }
    if (typeof raw === 'string') {
      return [{ type: 'text' as const, text: raw }];
    }
    const buildBlocksFromArray = (entries: unknown[]): ClaudeContentBlock[] => {
      const blocks: ClaudeContentBlock[] = [];
      entries.forEach((entry) => {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        const candidate = entry as Record<string, unknown>;
        const type = candidate.type;
        if (type === 'text') {
          blocks.push({
            type: 'text',
            text: typeof candidate.text === 'string' ? candidate.text : '',
          });
        } else if (type === 'thinking') {
          const thinking =
            typeof candidate.thinking === 'string'
              ? candidate.thinking
              : typeof candidate.text === 'string'
                ? candidate.text
                : '';
          blocks.push({
            type: 'thinking',
            thinking,
            text: thinking,
          });
        } else if (type === 'tool_use') {
          blocks.push({
            type: 'tool_use',
            id: typeof candidate.id === 'string' ? candidate.id : undefined,
            name: typeof candidate.name === 'string' ? candidate.name : 'Unknown',
            input: (candidate.input as Record<string, unknown>) ?? {},
          });
        }
      });
      return blocks;
    };

    const pickContent = (content: unknown): ClaudeContentBlock[] | null => {
      if (!content) {
        return null;
      }
      if (typeof content === 'string') {
        return [{ type: 'text' as const, text: content }];
      }
      if (Array.isArray(content)) {
        const result = buildBlocksFromArray(content);
        return result.length ? result : null;
      }
      return null;
    };

    return (
      pickContent(raw.message?.content ?? raw.content) ?? [
        { type: 'text' as const, text: '(无法解析内容)' },
      ]
    );
  };

  const getContentBlocks = (message: ClaudeMessage): ClaudeContentBlock[] => {
    const rawBlocks = normalizeBlocks(message.raw);
    if (rawBlocks) {
      return rawBlocks;
    }
    if (message.content) {
      return [{ type: 'text', text: message.content }];
    }
    return [{ type: 'text', text: '(空消息)' }];
  };

  const findToolResult = (toolUseId?: string, messageIndex?: number): ToolResultBlock | null => {
    if (!toolUseId || typeof messageIndex !== 'number') {
      return null;
    }
    for (let i = messageIndex + 1; i < messages.length; i += 1) {
      const candidate = messages[i];
      if (candidate.type !== 'user') {
        continue;
      }
      const raw = candidate.raw;
      if (!raw || typeof raw === 'string') {
        continue;
      }
      const content = raw.content;
      if (!Array.isArray(content)) {
        continue;
      }
      const resultBlock = content.find(
        (block): block is ToolResultBlock =>
          Boolean(block) && block.type === 'tool_result' && block.tool_use_id === toolUseId,
      );
      if (resultBlock) {
        return resultBlock;
      }
    }
    return null;
  };

  const sessionTitle = useMemo(() => {
    if (messages.length === 0) {
      return '新会话';
    }
    const firstUserMessage = messages.find((message) => message.type === 'user');
    if (!firstUserMessage) {
      return '新会话';
    }
    const text = getMessageText(firstUserMessage);
    return text.length > 15 ? `${text.substring(0, 15)}...` : text;
  }, [messages]);

  return (
    <>
      <div className="header">
        <div className="header-left">
          {currentView === 'history' ? (
            <button className="back-button" onClick={() => setCurrentView('chat')} data-tooltip="返回聊天">
              <BackIcon /> 返回
            </button>
          ) : (
            <div
              className="session-title"
              style={{
                fontWeight: 600,
                fontSize: '14px',
                color: '#e0e0e0',
                paddingLeft: '8px',
              }}
            >
              {sessionTitle}
            </div>
          )}
          <span className="status-indicator">{status !== DEFAULT_STATUS ? status : ''}</span>
        </div>
        <div className="header-right">
          {currentView === 'chat' && (
            <>
              <button className="icon-button" onClick={createNewSession} data-tooltip="新会话">
                <span className="codicon codicon-plus" />
              </button>
              <button
                className="icon-button"
                onClick={() => setCurrentView('history')}
                data-tooltip="历史记录"
              >
                <span className="codicon codicon-history" />
              </button>
              <button
                className="icon-button"
                onClick={() => setCurrentView('settings')}
                data-tooltip="设置"
              >
                <span className="codicon codicon-settings-gear" />
              </button>
            </>
          )}
        </div>
      </div>

      {currentView === 'settings' ? (
        <SettingsView onClose={() => setCurrentView('chat')} />
      ) : currentView === 'chat' ? (
        <div
          className="messages-container"
          ref={messagesContainerRef}
          onDrop={handleFileDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        >
          {messages.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#555',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ClawdIcon />
              </div>
              <div>给 Claude Code 发送消息</div>
            </div>
          )}

          {messages.map((message, messageIndex) => {
            if (!shouldShowMessage(message)) {
              return null;
            }

            return (
              <div key={messageIndex} className={`message ${message.type}`}>
                <div className="message-role-label">
                  {message.type === 'assistant' ? null : message.type === 'user' ? 'You' : message.type}
                </div>
                <div className="message-content">
                  {message.type === 'user' || message.type === 'error' ? (
                    <MarkdownBlock content={getMessageText(message)} />
                  ) : (
                    getContentBlocks(message).map((block, blockIndex) => (
                      <div key={`${messageIndex}-${blockIndex}`} className="content-block">
                        {block.type === 'text' && <MarkdownBlock content={block.text ?? ''} />}

                        {block.type === 'thinking' && (
                          <div className="thinking-block">
                            <div
                              className="thinking-header"
                              onClick={() => toggleThinking(messageIndex, blockIndex)}
                            >
                              <span className="thinking-title">思考过程</span>
                              <span className="thinking-icon">
                                {isThinkingExpanded(messageIndex, blockIndex) ? '▼' : '▶'}
                              </span>
                            </div>
                            {isThinkingExpanded(messageIndex, blockIndex) && (
                              <div className="thinking-content">
                                {block.thinking ?? block.text ?? '(无思考内容)'}
                              </div>
                            )}
                          </div>
                        )}

                        {block.type === 'tool_use' && (
                          <>
                            {block.name?.toLowerCase() === 'todowrite' &&
                            Array.isArray((block.input as { todos?: TodoItem[] })?.todos) ? (
                              <TodoListBlock
                                todos={(block.input as { todos?: TodoItem[] })?.todos ?? []}
                              />
                            ) : block.name?.toLowerCase() === 'task' ? (
                              <TaskExecutionBlock input={block.input} />
                            ) : block.name &&
                              ['read', 'read_file'].includes(block.name.toLowerCase()) ? (
                              <ReadToolBlock input={block.input} />
                            ) : block.name &&
                              ['edit', 'edit_file', 'replace_string', 'write_to_file'].includes(
                                block.name.toLowerCase(),
                              ) ? (
                              <EditToolBlock name={block.name} input={block.input} />
                            ) : block.name &&
                              ['bash', 'run_terminal_cmd', 'execute_command'].includes(
                                block.name.toLowerCase(),
                              ) ? (
                              <BashToolBlock
                                name={block.name}
                                input={block.input}
                                result={findToolResult(block.id, messageIndex)}
                              />
                            ) : (
                              <GenericToolBlock name={block.name} input={block.input} />
                            )}
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {/* 消息操作按钮 */}
                <div className="message-actions">
                  {message.type === 'user' && (
                    <button
                      className="message-action-button"
                      onClick={() => resendMessage(message)}
                      title="重新发送此消息"
                    >
                      <span className="codicon codicon-refresh" />
                      <span>重发</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {loading && <div className="loading show">Claude 正在思考</div>}
        </div>
      ) : (
        <HistoryView historyData={historyData} onLoadSession={loadHistorySession} />
      )}

      {currentView === 'chat' && (
        <div
          className={`input-area ${isDragging ? 'dragging' : ''}`}
          onDrop={handleFileDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        >
          {/* 消息历史导航器 */}
          {historyNavigator && (
            <div className="message-history-navigator">
              <div className="navigator-info">
                <span className="navigator-icon">🕰️</span>
                <span className="navigator-text">{historyNavigator.messageText}</span>
                <span className="navigator-position">
                  {(() => {
                    const userMessages = messages.filter((msg) => msg.type === 'user');
                    const currentMsgIndex = userMessages.findIndex(
                      (msg) => messages[historyNavigator.messageIndex] === msg
                    );
                    return `第 ${currentMsgIndex + 1}/${userMessages.length} 条`;
                  })()}
                </span>
              </div>
              <div className="navigator-controls">
                <button
                  className="navigator-button"
                  onClick={() => navigateHistory(-1)}
                  title="上一条 (Ctrl+↑)"
                >
                  ↑
                </button>
                <button
                  className="navigator-button"
                  onClick={() => navigateHistory(1)}
                  title="下一条 (Ctrl+↓)"
                >
                  ↓
                </button>
                <button
                  className="navigator-button primary"
                  onClick={() => setHistoryNavigator(null)}
                  title="使用此消息"
                >
                  使用
                </button>
                <button
                  className="navigator-button"
                  onClick={cancelHistoryNavigator}
                  title="取消"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* 快捷键提示 */}
          {!historyNavigator && !inputMessage.trim() && (
            <div className="input-hint">
              <span className="hint-icon">💡</span>
              <span className="hint-text">
                提示：在 IDE 中选中代码后按
                <kbd className="hint-keyboard">Cmd/ Ctrl + Alt + K</kbd>
                添加到输入框，或直接拖拽文件和文件夹
              </span>
            </div>
          )}
          
          <div className="input-container">
            <div className="input-wrapper">
              <textarea
                id="messageInput"
                ref={inputRef}
                value={inputMessage}
                onChange={(event) => setInputMessage(event.target.value)}
                onKeyDown={handleKeydown}
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onScroll={(e) => {
                  const preview = e.currentTarget.nextElementSibling as HTMLElement;
                  if (preview) {
                    preview.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
                placeholder="输入消息... (Shift+Enter 换行, Enter 发送)"
                rows={1}
                disabled={loading}
              />
              {/* 颜色编码覆盖层 - 显示在输入框内 */}
              {inputMessage.trim() && (
                <div className="input-highlight" aria-hidden="true">
                  {parseInputContent(inputMessage).map((line: { type: 'codeblock' | 'file' | 'directory' | 'text'; text: string; key: string }, index: number, array: Array<{ type: 'codeblock' | 'file' | 'directory' | 'text'; text: string; key: string }>) => {
                    const isLast = index === array.length - 1;
                    const content = line.text + (isLast ? '' : '\n');
                    
                    if (line.type === 'codeblock') {
                      return (
                        <span key={line.key} className="highlight-line codeblock-highlight">
                          {content}
                        </span>
                      );
                    }
                    if (line.type === 'file') {
                      return (
                        <span key={line.key} className="highlight-line file-highlight">
                          {content}
                        </span>
                      );
                    }
                    if (line.type === 'directory') {
                      return (
                        <span key={line.key} className="highlight-line directory-highlight">
                          {content}
                        </span>
                      );
                    }
                    return (
                      <span key={line.key} className="highlight-line">
                        {content}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="input-footer">
              <div className="input-tools-left" />
              <div className="input-actions">
                {loading ? (
                  <button className="action-button stop-button" onClick={interruptSession} title="中断生成">
                    <StopIcon />
                  </button>
                ) : (
                  <button
                    className="action-button send-button"
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || loading}
                    title="发送消息"
                  >
                    <SendIcon />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showNewSessionConfirm}
        title="创建新会话"
        message="当前会话已有消息，确定要创建新会话吗？"
        confirmText="确定"
        cancelText="取消"
        onConfirm={handleConfirmNewSession}
        onCancel={handleCancelNewSession}
      />
    </>
  );
};

export default App;

