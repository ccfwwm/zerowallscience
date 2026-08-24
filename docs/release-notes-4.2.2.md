# ZeroWall Science 4.2.2

## 模型状态检测

- 模型可用性检测现在会依次尝试 OpenAI Chat Completions、OpenAI Responses 和 Claude Messages 三种协议。
- 任意一种协议成功即可将模型标记为可用，并在模型选择器和设置页显示实际通过的协议。
- 模型检测继续在启动后异步执行，不阻塞对话界面；单模型检测失败会保留各协议的可读错误信息。

## 其他

- 发布 DSH RC2 的协议探测修复版本。
