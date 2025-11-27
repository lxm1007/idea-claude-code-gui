import React from 'react';

export interface AttachmentItem {
  type: 'file' | 'directory' | 'codeblock';
  path: string;
  name: string;
}

interface AttachmentChipsProps {
  attachments: AttachmentItem[];
  onRemove: (index: number) => void;
}

const AttachmentChips: React.FC<AttachmentChipsProps> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) {
    return null;
  }

  const getIcon = (type: AttachmentItem['type']) => {
    switch (type) {
      case 'file':
        return <span className="codicon codicon-file" style={{ fontSize: '14px' }} />;
      case 'directory':
        return <span className="codicon codicon-folder" style={{ fontSize: '14px' }} />;
      case 'codeblock':
        return <span className="codicon codicon-code" style={{ fontSize: '14px' }} />;
      default:
        return null;
    }
  };

  const getChipClass = (type: AttachmentItem['type']) => {
    switch (type) {
      case 'file':
        return 'attachment-chip file-chip';
      case 'directory':
        return 'attachment-chip directory-chip';
      case 'codeblock':
        return 'attachment-chip codeblock-chip';
      default:
        return 'attachment-chip';
    }
  };

  // 缩略显示长路径
  const truncatePath = (path: string, maxLength: number = 50) => {
    if (path.length <= maxLength) {
      return path;
    }
    // 保留开头和结尾
    const start = path.substring(0, 20);
    const end = path.substring(path.length - 25);
    return `${start}...${end}`;
  };

  return (
    <div className="attachment-chips-container">
      {attachments.map((attachment, index) => {
        const displayText = attachment.type === 'codeblock' 
          ? truncatePath(attachment.path, 60)
          : attachment.name;
        
        return (
          <div key={index} className={getChipClass(attachment.type)}>
            <span className="chip-icon">{getIcon(attachment.type)}</span>
            <span className="chip-text" title={attachment.path}>
              {displayText}
            </span>
            <button
              className="chip-remove"
              onClick={() => onRemove(index)}
              title="移除"
              type="button"
            >
              <span className="codicon codicon-close" style={{ fontSize: '12px' }} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default AttachmentChips;

