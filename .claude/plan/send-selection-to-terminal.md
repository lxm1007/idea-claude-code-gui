# 任务：实现选中代码发送到终端功能

## 需求背景
- 用户选中代码后，按快捷键将代码信息发送到当前打开的终端窗口
- 输出格式：`@docs/claude-agent-sdk.md#L9-11`
- 支持多行代码，显示起始和结束行号
- 发送到当前激活的终端窗口，粘贴后自动聚焦

## 技术方案
创建专用 `SendSelectionToTerminalAction` 类，继承 `AnAction`

## 关键实现点

### 1. 跨平台快捷键配置
- Mac: `Cmd+Option+K` (Meta+Alt+K)
- Windows/Linux: `Ctrl+Alt+K` (Control+Alt+K)

### 2. 核心逻辑
- 获取当前编辑器中的选中代码
- 获取文件路径（相对于项目根目录）
- 计算选中代码的起始和结束行号
- 格式化为：`@relativePath#Lstart-Lend`
- 发送到当前激活的终端窗口
- 自动聚焦到终端

### 3. 异常处理
- 无选中代码时显示提示
- 无终端窗口时自动打开
- 无当前编辑器时显示错误

## 执行步骤

### 步骤 1：创建 SendSelectionToTerminalAction.java
- 继承 `AnAction`
- 实现 `actionPerformed` 方法
- 实现 `update` 方法检查可用性
- 添加完整的异常处理和用户反馈

### 步骤 2：更新 plugin.xml
- 在 `actions` 节点下添加新的 action 配置
- 配置显示名称、描述、图标
- 绑定快捷键（使用条件性绑定支持不同平台）

### 步骤 3：测试验证
- 测试多行选中
- 测试单行选中
- 测试无选中场景
- 测试跨平台快捷键

## 文件列表
1. `/src/main/java/com/github/claudecodegui/SendSelectionToTerminalAction.java` - 新建
2. `/src/main/resources/META-INF/plugin.xml` - 修改

## 成功标准
- 选中代码后按快捷键能将信息发送到终端
- 输出格式正确（@path#Lstart-Lend）
- 终端自动聚焦
- 跨平台快捷键正常工作
- 错误场景有用户友好的提示

## 实现开始时间
2025-11-27 11:49