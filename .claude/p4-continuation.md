# P4 Phase 3-8 Continuation Plan

## Current Status (After Context Compression)
- ✅ Phase 1: 23 domains, 247 tools registry complete
- ✅ Phase 2-3: 5/23 domains have contracts (literature, variants, genomics, proteomics, chemistry)
- ⏳ Phase 3: Need 18 more domain contracts

## Remaining Work

### 1. Complete Domain Contracts (18 domains)
Priority order:
1. protein-structure (10 tools)
2. protein-interactions (6 tools)
3. pathways (16 tools)
4. gene-expression (15 tools)
5. clinical-trials (14 tools)
6. metabolomics (17 tools)
7. transcriptomics (9 tools)
8. single-cell (5 tools)
9. drug-discovery (5 tools)
10. regulatory (7 tools)
11. cell-lines (11 tools)
12. ontology (10 tools)
13. imaging (8 tools)
14. taxonomy (7 tools)
15. epidemiology (8 tools)
16. biobanks (3 tools)
17. antibodies (4 tools)
18. assays (9 tools)

### 2. Validation & Fixes
- Run contract test suite
- Fix empty query handling
- Fix OpenAlex key/401/403 errors
- Add desensitized logging

### 3. TLS & Security
- Independent TLS context per connector
- Validate certificate handling

### 4. Skills Integration
- Adapt life-science model workflow skills
- Link MCP tools to biomodel skills

### 5. UI Integration
- Ketcher 2D chemical editor
- 3Dmol.js structure viewer
- Bidirectional jump between 2D/3D

### 6. Testing
- Smoke tests for keyless public tools
- Integration tests

## Execution Strategy
1. Batch-create remaining contracts (focus on tool count and schema accuracy)
2. Run validation suite
3. Address test failures
4. Document completion

## Files to Track
- runtime/connectors/fixtures/rakserver-contracts/contracts/*.json
- runtime/connectors/fixtures/rakserver-contracts/test-suite.test.ts
- runtime/connectors/manifests/*.json
