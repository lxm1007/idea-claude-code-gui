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

type PendingFileItem = {
  path: string;
  type: 'file' | 'directory';
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
  const [pendingCodeBlocks, setPendingCodeBlocks] = useState<{ id: string; content: string; formatted: string }[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFileItem[]>([]);

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
      // 将选中的代码添加到待发送列表
      const blockId = `code-block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const blockNumber = pendingCodeBlocks.length + 1;
      const formattedInfo = `代码块 ${blockNumber}: ${info}`;
      setPendingCodeBlocks((prev) => [
        ...prev,
        {
          id: blockId,
          content: info,
          formatted: formattedInfo,
        },
      ]);
    };
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

  // 移除待发送的代码块
  const removePendingCodeBlock = (index: number) => {
    setPendingCodeBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  // 移除待发送的文件
  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // 递归获取文件和文件夹路径
  const getDroppedItems = async (dataTransfer: DataTransfer): Promise<PendingFileItem[]> => {
    const items: PendingFileItem[] = [];
    const fileList = Array.from(dataTransfer.files);

    // 检查是否支持webkitGetAsEntry (用于检测文件夹)
    const hasWebkit = 'webkitGetAsEntry' in File.prototype;

    if (hasWebkit && dataTransfer.items && dataTransfer.items.length > 0) {
      const processEntry = async (entry: FileSystemEntry, path: string = ''): Promise<void> => {
        if (entry.isFile) {
          const file = await new Promise<File>((resolve) => {
            (entry as FileSystemFileEntry).file(resolve);
          });
          items.push({ path: `@${path}${file.name}`, type: 'file' });
        } else if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry;
          items.push({ path: `@${path}${dirEntry.name}/`, type: 'directory' });
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
      items.push(...fileList.map(file => ({ path: `@${file.name}`, type: 'file' as const })));
    }

    return items;
  };

  // 处理文件拖拽
  const handleFileDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    getDroppedItems(event.dataTransfer).then(filePaths => {
      setPendingFiles((prev) => [...prev, ...filePaths]);
    });
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // 发送消息时，将待发送的代码块和文件一起发送
  const sendMessage = () => {
    const message = inputMessage.trim();
    if (!message && pendingCodeBlocks.length === 0 && pendingFiles.length === 0 || loading) {
      return;
    }

    // 构建完整的消息内容
    let fullMessage = message;
    const attachments: string[] = [];

    // 添加代码块
    if (pendingCodeBlocks.length > 0) {
      attachments.push(...pendingCodeBlocks.map(block => block.content));
    }

    // 添加文件
    if (pendingFiles.length > 0) {
      attachments.push(...pendingFiles.map(file => file.path));
    }

    if (attachments.length > 0) {
      fullMessage = message ? `${message}\n\n${attachments.join('\n')}` : attachments.join('\n');
    }

    sendBridgeMessage('send_message', fullMessage);
    setInputMessage('');
    setPendingCodeBlocks([]); // 清空待发送的代码块
    setPendingFiles([]); // 清空待发送的文件
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

  const handleKeydown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
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
              </div>
            );
          })}

          {loading && <div className="loading show">Claude 正在思考</div>}
        </div>
      ) : (
        <HistoryView historyData={historyData} onLoadSession={loadHistorySession} />
      )}

      {currentView === 'chat' && (
        <div className="input-area" onDrop={handleFileDrop} onDragOver={handleDragOver}>
          {/* 快捷键提示 */}
          {pendingCodeBlocks.length === 0 && pendingFiles.length === 0 && (
            <div className="input-hint">
              <span className="hint-icon">💡</span>
              <span className="hint-text">
                提示：在 IDE 中选中代码后按
                <kbd className="hint-keyboard">Cmd/ Ctrl + Alt + K</kbd>
                添加到待发送列表
              </span>
            </div>
          )}
          <div className="input-container">
            <textarea
              id="messageInput"
              ref={inputRef}
              value={inputMessage}
              onChange={(event) => setInputMessage(event.target.value)}
              onKeyDown={handleKeydown}
              placeholder="输入消息... (Shift+Enter 换行, Enter 发送)"
              rows={1}
              disabled={loading}
            />
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
                    disabled={(!inputMessage.trim() && pendingCodeBlocks.length === 0 && pendingFiles.length === 0) || loading}
                    title="发送消息"
                  >
                    <SendIcon />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 待发送的附件列表（代码块 + 文件） */}
          {(pendingCodeBlocks.length > 0 || pendingFiles.length > 0) && (
            <div className="pending-attachments">
              {/* 待发送的代码块 */}
              {pendingCodeBlocks.map((codeBlock, index) => (
                <div key={codeBlock.id} className="pending-item pending-code">
                  <div className="pending-item-header">
                    <span className="pending-item-icon">💻</span>
                    <span className="pending-item-text">{codeBlock.formatted}</span>
                    <button
                      className="pending-item-remove"
                      onClick={() => removePendingCodeBlock(index)}
                      title="移除代码块"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              {/* 待发送的文件 */}
              {pendingFiles.map((fileItem, index) => (
                <div
                  key={`file-${index}`}
                  className={`pending-item ${
                    fileItem.type === 'directory' ? 'pending-directory' : 'pending-file'
                  }`}
                >
                  <div className="pending-item-header">
                    <span className="pending-item-icon">
                      {fileItem.type === 'directory' ? '📁' : '📎'}
                    </span>
                    <span className="pending-item-text">{fileItem.path}</span>
                    <button
                      className="pending-item-remove"
                      onClick={() => removePendingFile(index)}
                      title={`移除${fileItem.type === 'directory' ? '文件夹' : '文件'}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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

