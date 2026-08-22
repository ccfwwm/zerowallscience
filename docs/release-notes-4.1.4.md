# ZeroWall Science 4.1.4

## 修复

- 更新检查请求对七牛云 Stable 更新指针使用 `Cache-Control: no-cache`，避免客户端长期使用旧的 `latest.yml`。
- 七牛发布脚本为 YAML 和 JSON 元数据写入正确 MIME 类型，并在发布后主动刷新 Stable CDN 更新指针。

## 说明

4.1.4 用于验证 Stable 更新链路。若本地版本已经是 4.1.4，更新器显示“当前已是最新版本”是正常行为。
