# PPT 模板风格库

模板按来源分为三组：

- `initial/`：项目初始内置的 10 套风格。
- `featured/`：后续筛选补充的 22 套精选风格。
- `xiamulingzi/`：设计师 @夏目玲子 提供的 233 套 PPT 模板风格。

每套风格都由同目录、同名的两个文件组成：

```text
<style-id>.md
<style-id>.layouts.json
```

调用时传入 Markdown 文件的完整路径，例如：

```bash
python3 scripts/generate_ppt.py \
  --plan slides_plan.json \
  --style styles/initial/gradient-glass.md
```
