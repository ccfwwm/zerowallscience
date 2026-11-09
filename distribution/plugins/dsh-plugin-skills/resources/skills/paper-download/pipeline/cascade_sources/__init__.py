"""Sources d'acquisition PDF supplémentaires (intégrées depuis paper-search-mcp).

13 plateformes additionnelles à la cascade native de pipeline/cascade.py :
dblp, Semantic Scholar, PMC, Europe PMC, biorxiv, medrxiv, OpenAIRE,
CiteSeerX, DOAJ, BASE, Zenodo, SSRN, IACR.

Code adapté depuis https://github.com/openags/paper-search-mcp sous
licence MIT (cf. NOTICE.md à la racine du plugin).
"""
from .dblp import DBLPSearcher
from .semantic import SemanticSearcher
from .pmc import PMCSearcher
from .europepmc import EuropePMCSearcher
from .biorxiv import BioRxivSearcher
from .medrxiv import MedRxivSearcher
from .openaire import OpenAiresearcher
from .citeseerx import CiteSeerXSearcher
from .doaj import DOAJSearcher
from .base_search import BASESearcher
from .zenodo import ZenodoSearcher
from .ssrn import SSRNSearcher
from .iacr import IACRSearcher

__all__ = [
    "DBLPSearcher", "SemanticSearcher", "PMCSearcher", "EuropePMCSearcher",
    "BioRxivSearcher", "MedRxivSearcher", "OpenAiresearcher",
    "CiteSeerXSearcher", "DOAJSearcher", "BASESearcher", "ZenodoSearcher",
    "SSRNSearcher", "IACRSearcher",
]
