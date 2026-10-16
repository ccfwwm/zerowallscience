# 科学引擎模型包

HE / StarDist 模型包只保存模型数据及来源证据，不携带 wheel、Python、venv、conda 或私有 site-packages。Python 依赖使用 [固定共享运行时](python-environment.md)，来自签名依赖清单；Fiji、napari、R 和远程服务仍是外部运行时。

## 当前格式边界

构建工具为 tools/science/build-he-engine-package.mjs，校验与导入入口为 tools/science/science-engine.mjs。它们保留历史 shared-python-model-v1 格式：engineVersion 为 7.1.0，归档文件名带 7.4.0，兼容应用列表止于 7.4.0。**这套历史合同不能直接视为已经支持 8.3.0；后续需要时先升级生成器、兼容范围及测试，不能仅修改本文或重命名 ZIP。** 当前不为目录清理重发模型包。

包清单记录平台/架构、模型每个文件的大小与 SHA-256、来源文件、Python 共享布局、依赖引用及能力边界。HE 包保存 OpenSlide 来源声明；StarDist 另带固定哈希的 2D_versatile_he 模型。openslide-python、openslide-bin、Pillow、stardist、csbdeep、tensorflow 等依赖由共享清单维护，不进入模型 ZIP。

## 维护命令

仅在维护并验证上述格式时执行，输出指定新的 artifacts 目录：

```powershell
node tools/science/build-he-engine-package.mjs --engine he --output artifacts/verification/<version>/science-engine/he-<build-id>
node tools/science/build-he-engine-package.mjs --engine he-stardist --model <已核验模型目录> --output artifacts/verification/<version>/science-engine/stardist-<build-id>
node tools/science/science-engine.mjs verify --manifest <manifest.json> --archive <package.zip> --manifest-sha256 <可信清单摘要>
node tools/science/science-engine.mjs import --manifest <manifest.json> --archive <package.zip> --manifest-sha256 <可信清单摘要> --root <模型数据目录>
node --test tests/contracts/science-engine-package.test.mjs
```

导入前检查清单信任摘要、平台、共享 Python 布局、归档与所有成员摘要、路径安全和展开上限。临时目录校验完成后原子替换模型目录并写 install-receipt.json，失败保留原模型。导入不会创建 Python 环境，也不接受解释器路径参数。

目录清理和文档更新不代表已经完成模型推理、整张切片处理或 GPU 验收；实际能力以相应生成器、兼容合同与真实测试为准。
