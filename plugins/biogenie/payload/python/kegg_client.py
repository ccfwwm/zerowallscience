"""KEGG API 客户端 - 代谢通路搜索与设计"""
import sys
import requests
import json
from typing import Dict, List, Optional


class KEGGClient:
    """KEGG REST API 客户端"""
    
    def __init__(self, base_url: str = 'https://rest.kegg.jp'):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Accept': 'application/json',
            'User-Agent': 'dsh-bio-genie/0.3.0'
        })
    
    def _request(self, endpoint: str, timeout: int = 10) -> Optional[str]:
        """发送GET请求"""
        url = f'{self.base_url}/{endpoint}'
        try:
            response = self.session.get(url, timeout=timeout)
            if response.status_code == 200:
                return response.text
            else:
                return None
        except Exception as e:
            print(f'KEGG API error: {e}', file=sys.stderr)
            return None
    
    def list_pathways(self, organism: str = 'eco') -> List[Dict]:
        """列出指定生物的所有通路"""
        text = self._request(f'list/pathway/{organism}')
        if not text:
            return []
        
        pathways = []
        for line in text.strip().split('\n'):
            if not line:
                continue
            parts = line.split('\t')
            if len(parts) >= 2:
                pathway_id = parts[0].replace('path:', '')
                name = parts[1].split(' - ')[0]  # 移除物种描述
                pathways.append({
                    'id': pathway_id,
                    'name': name,
                    'organism': organism,
                })
        return pathways
    
    def get_pathway(self, pathway_id: str) -> Optional[Dict]:
        """获取通路详细信息"""
        # 确保通路ID格式正确
        if not pathway_id.startswith('path:'):
            pathway_id = f'path:{pathway_id}'
        
        text = self._request(f'get/{pathway_id}')
        if not text:
            return None
        
        # 解析通路信息
        info = {
            'id': pathway_id,
            'name': '',
            'description': '',
            'reactions': [],
            'genes': [],
        }
        
        current_section = None
        for line in text.split('\n'):
            if line.startswith('NAME'):
                info['name'] = line.split('NAME')[1].strip()
            elif line.startswith('DESCRIPTION'):
                info['description'] = line.split('DESCRIPTION')[1].strip()
            elif line.startswith('GENE'):
                current_section = 'genes'
                gene_part = line.split('GENE')[1].strip()
                if gene_part:
                    gene_id = gene_part.split(';')[0].strip()
                    info['genes'].append(gene_id)
            elif line.startswith('RELAY'):
                current_section = None
            elif current_section == 'genes' and line.startswith('            '):
                # 续行
                gene_part = line.strip()
                if gene_part:
                    gene_id = gene_part.split(';')[0].strip()
                    info['genes'].append(gene_id)
        
        return info
    
    def search_pathways_by_metabolite(self, metabolite: str, organism: str = 'eco') -> List[Dict]:
        """根据代谢物搜索相关通路"""
        # 搜索包含该代谢物的通路
        pathways = self.list_pathways(organism)
        
        # 简单匹配（实际应使用更复杂的搜索）
        matched = []
        for pathway in pathways:
            if metabolite.lower() in pathway['name'].lower():
                matched.append(pathway)
        
        return matched
    
    def get_reaction(self, reaction_id: str) -> Optional[Dict]:
        """获取反应详细信息"""
        if not reaction_id.startswith('rn:'):
            reaction_id = f'rn:{reaction_id}'
        
        text = self._request(f'get/{reaction_id}')
        if not text:
            return None
        
        info = {
            'id': reaction_id,
            'name': '',
            'equation': '',
            'enzymes': [],
        }
        
        for line in text.split('\n'):
            if line.startswith('NAME'):
                info['name'] = line.split('NAME')[1].strip()
            elif line.startswith('EQUATION'):
                info['equation'] = line.split('EQUATION')[1].strip()
            elif line.startswith('ENZYME'):
                enzyme_part = line.split('ENZYME')[1].strip()
                if enzyme_part:
                    info['enzymes'].extend(enzyme_part.split())
        
        return info
    
    def get_compound(self, compound_id: str) -> Optional[Dict]:
        """获取化合物详细信息"""
        if not compound_id.startswith('cpd:'):
            compound_id = f'cpd:{compound_id}'
        
        text = self._request(f'get/{compound_id}')
        if not text:
            return None
        
        info = {
            'id': compound_id,
            'name': '',
            'formula': '',
            'exact_mass': '',
        }
        
        for line in text.split('\n'):
            if line.startswith('NAME'):
                info['name'] = line.split('NAME')[1].strip()
            elif line.startswith('FORMULA'):
                info['formula'] = line.split('FORMULA')[1].strip()
            elif line.startswith('EXACT_MASS'):
                info['exact_mass'] = line.split('EXACT_MASS')[1].strip()
        
        return info


def search_pathways(target_metabolite: str, organism: str = 'eco', limit: int = 10) -> List[Dict]:
    """搜索代谢通路"""
    client = KEGGClient()
    
    # 获取所有通路
    pathways = client.list_pathways(organism)
    
    # 搜索相关通路
    matched = []
    for pathway in pathways:
        # 检查通路名称是否包含目标代谢物
        if target_metabolite.lower() in pathway['name'].lower():
            matched.append({
                'id': pathway['id'],
                'name': pathway['name'],
                'score': 0.9,  # 名称匹配得分高
            })
        
        # 如果已找到足够通路，停止搜索
        if len(matched) >= limit:
            break
    
    # 如果名称匹配不足，尝试搜索更广泛的关键词
    if len(matched) < limit:
        keywords = target_metabolite.lower().split()
        for pathway in pathways:
            # 检查通路名称是否包含任何关键词
            name_lower = pathway['name'].lower()
            if any(keyword in name_lower for keyword in keywords):
                # 避免重复
                if not any(p['id'] == pathway['id'] for p in matched):
                    matched.append({
                        'id': pathway['id'],
                        'name': pathway['name'],
                        'score': 0.6,  # 关键词匹配得分较低
                    })
            
            # 如果已找到足够通路，停止搜索
            if len(matched) >= limit:
                break
    
    return matched


def design_pathway(target_product: str, host_organism: str = 'eco', strategy: str = 'shortest') -> Dict:
    """设计代谢通路"""
    # 这是一个简化版本，实际实现需要更复杂的算法
    client = KEGGClient()
    
    # 搜索目标产物相关通路
    pathways = search_pathways(target_product, host_organism, limit=5)
    
    if not pathways:
        return {
            'target_product': target_product,
            'host_organism': host_organism,
            'strategy': strategy,
            'pathways': [],
            'suggestion': f'No pathways found for {target_product} in {host_organism}',
        }
    
    # 选择最佳通路
    best_pathway = pathways[0]
    
    return {
        'target_product': target_product,
        'host_organism': host_organism,
        'strategy': strategy,
        'pathways': pathways,
        'best_pathway': best_pathway,
        'enzymes_needed': 'N/A (simplified estimate)',
        'estimated_steps': 'N/A (simplified estimate)',
        'suggestion': f'Consider using pathway {best_pathway["id"]} for {target_product} production',
    }


if __name__ == '__main__':
    # 测试
    client = KEGGClient()
    
    # 列出E. coli通路
    pathways = client.list_pathways('eco')
    print(f'Found {len(pathways)} pathways')
    
    # 搜索葡萄糖相关通路
    matched = search_pathways('glucose', 'eco', limit=5)
    print(f'Found {len(matched)} glucose-related pathways')
    
    for p in matched:
        print(f'  {p["id"]}: {p["name"]}')