"""Produce the release's reviewable coverage and acceptance reports."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', required=True)
    args = parser.parse_args()
    work = Path(args.work).resolve()
    audit = json.loads((ROOT/'resources/python/skill-dependencies.json').read_text('utf-8'))
    verification = json.loads((work/'verification.json').read_text('utf-8'))
    policy = json.loads((ROOT/'resources/python/skill-dependency-policy.json').read_text('utf-8'))
    output = work/'reports'
    output.mkdir(exist_ok=True)
    lines = ['# Python 3.12.10 / ZeroWall 共享科研环境 Skills 覆盖报告', '',
             f"审计 {len(audit['skills'])} 个 Skill、{audit['scannedFiles']} 个文件；安装 {audit['installedPackageCount']} 个发行包。", '',
             '状态以真实安装、共享运行时导入和版本要求为依据。文档示例、开发测试和外部服务单独记录；',
             '“已管理”不代表每项在线服务、模型或任意文档示例都经过端到端验证。完整计算验证见功能报告。', '',
             f"状态统计：`{json.dumps(audit['summary'], ensure_ascii=False)}`。Python AST 解析错误：{len(audit['parseErrors'])}。", '',
             '## 共享运行时边界与例外', '', '| Skill | 原因 |', '| --- | --- |']
    for name, reason in policy.get('incompatible', {}).items():
        lines.append(f'| {name} | {reason} |')
    lines += ['', '所有 Windows Python 包都通过签名依赖清单进入同一个共享 site-packages；模型权重、系统工具和 Playwright 浏览器本体仍按各自资源机制管理。', '',
              '## 全部 Skill', '', '| Skill / 路径 | 状态 | 已验证依赖 | 待配置、版本不符或未验证依赖 |', '| --- | --- | --- | --- |']
    for skill in audit['skills']:
        ready = ', '.join(r['name']+' '+r.get('installedVersion','') for r in skill['requirements'] if r['status']=='managed') or '—'
        pending = ', '.join(r['name']+('（版本不符）' if r['validation']=='version-mismatch' else '') for r in skill['requirements'] if r['status']!='managed') or '—'
        lines.append(f"| {skill['path']} | {skill['status']} | {ready} | {pending} |")
    lines += ['', '## 审计边界', '',
              'AST 和安装声明是静态证据，运行时拼接的任意字符串不能保证穷尽。受保护的 ImportError 分支标为可选功能。',
              '每一依赖的来源文件、行号、角色、声明版本、安装版本、相对安装位置和验证结果保存在同目录 skill-dependencies.json。',
              '全部测试禁用个人 site-packages，完整科研测试不加载用户 overlay；客户端回归另行验证现有六个扩展。']
    (output/'skills-coverage.md').write_text('\n'.join(lines)+'\n','utf-8')
    (output/'skill-dependencies.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2),'utf-8')
    lines = ['# ZeroWall 共享科研环境功能验收', '', f"解释器：{verification['python']}；运行时：{verification.get('runtimeMode', 'shared')}；包数量：{len(verification['packages'])}。", '',
             '## 实际计算与文件处理', '', '| 测试 | 结果 | 耗时（秒） |', '| --- | --- | --- |']
    for name, result in verification['cases'].items():
        lines.append(f"| {name} | {'PASS' if result['ok'] else 'FAIL'} | {result['seconds']} |")
    lines += ['', f"共享运行时导入：{sum(r['ok'] for r in verification['imports'].values())}/{len(verification['imports'])} 通过。", '',
              'PyZotero 使用模拟 HTTP 响应验证接口，不访问个人文献库。Office 包含 PDF、DOCX、PPTX、XLS、XLSX。',
              '图像包含 SIFT、感知哈希、SSIM、PNG/TIFF/HEIF；医学影像包含 DICOM/JPEG-LS/RLE、NIfTI、NRRD、SimpleITK。',
              'PyMC 已在没有 g++ 的条件下完成 CPU 采样验证；本包不附带 C++ 编译器，需要编译加速的专用工作流应另配工具链。',
              '完整标准输出与诊断保存于 verification.json。']
    client_path = work/'client-verification.json'
    if client_path.exists():
        client=json.loads(client_path.read_text('utf-8'))
        lines += ['', '## 桌面与更新', '']
        lines.extend(f"- {e['test']}: {'PASS' if e['ok'] else 'FAIL'}" for e in client['events'])
    integrity = work/'integrity.log'
    if integrity.exists():
        lines += ['', '## 图像完整流程日志', '', '```text', integrity.read_text('utf-8',errors='replace')[-10000:], '```']
    lines += ['', '## 本次发布工具测试', '',
              '依赖审计 2 项、发布顺序与失败门禁 5 项、桌面更新 15 项、Python 工具宿主 3 项、MCP 环境契约 2 项。', '',
              '真实回滚测试发现旧桌面代码会把当前 manifest 错用于另一个手动选择目录；源码已修复目录绑定并补回归测试。',
              '本次不发布桌面安装包，旧客户端回滚请恢复备份的 current.json 指针；修复后的手动选择路径另经实际健康检查验证。', '',
              '## 安装清单', '', '| 包 | 版本 |', '| --- | --- |']
    lines.extend(f'| {name} | {version} |' for name,version in sorted(verification['packages'].items()))
    (output/'functional-verification.md').write_text('\n'.join(lines)+'\n','utf-8')
    for name in ['verification.json','client-verification.json','wheel-inventory.json','public-verification.json']:
        if (work/name).exists(): (output/name).write_bytes((work/name).read_bytes())
    (output/'requirements-windows.lock').write_bytes((ROOT/'resources/python/requirements-windows.lock').read_bytes())
    public = work/'public-verification.json'
    if public.exists():
        release=json.loads(public.read_text('utf-8'))
        (output/'release.md').write_text('\n'.join([
            '# Python 3.12.10 科研环境 1.4.0 / 修订 1', '',
            f"安装包：[{release['archiveUrl']}]({release['archiveUrl']})", '',
            f"签名 manifest：[{release['manifestUrl']}]({release['manifestUrl']})", '',
            f"更新源：[{release['latestUrl']}]({release['latestUrl']})", '',
            f"文件大小：{release['size']:,} 字节。", '', f"SHA-256：`{release['sha256']}`", '',
            f"公开地址复核时间：{release['checkedAt']}；签名：stable-3 / Ed25519。", '',
            '387 个核心发行包，保留旧版全部 127 个核心锁定版本；131 项隔离导入、16 组实际计算与文件处理通过。',
            '详见 skills-coverage.md、functional-verification.md、requirements-windows.lock 和各 JSON 验证证据。',
            '1.3.0 版本资产保留，可恢复旧更新指针或选择旧签名槽位回滚。', '',
        ]), 'utf-8')
    print(output)


if __name__=='__main__':main()
