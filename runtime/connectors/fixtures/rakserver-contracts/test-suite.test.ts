import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';

const CONTRACTS_DIR = join(__dirname, 'contracts');
const MANIFESTS_DIR = join(__dirname, '../../manifests');

interface Contract {
  domain: string;
  version: string;
  description: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: object;
    outputSchema: object;
    errorCases?: Array<{
      case: string;
      condition?: string;
      expectedError: object;
    }>;
    rateLimits?: {
      requestsPerSecond: number;
      note?: string;
    };
    examples?: Array<{
      name: string;
      input: object;
      expectedFields: string[];
    }>;
  }>;
}

interface Manifest {
  domain: string;
  toolCount: number;
  tools: Array<{
    name: string;
    description: string;
  }>;
}

describe('Rakserver Contract Validation', () => {
  const ajv = new Ajv({ strict: false });

  describe('Contract files', () => {
    it('should load all contract files without errors', () => {
      const files = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const path = join(CONTRACTS_DIR, file);
        const content = readFileSync(path, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
      }
    });

    it('should have valid JSON schema for all tools', () => {
      const files = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const path = join(CONTRACTS_DIR, file);
        const contract: Contract = JSON.parse(readFileSync(path, 'utf-8'));

        for (const tool of contract.tools) {
          // Validate inputSchema is valid JSON Schema
          expect(() => ajv.compile(tool.inputSchema)).not.toThrow();

          // Validate outputSchema is valid JSON Schema
          expect(() => ajv.compile(tool.outputSchema)).not.toThrow();
        }
      }
    });
  });

  describe('Contract-Manifest consistency', () => {
    it('should have contracts for all domains with manifests', () => {
      const manifestFiles = readdirSync(MANIFESTS_DIR).filter(f => f.endsWith('.json'));
      const contractFiles = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));

      const manifestDomains = manifestFiles.map(f => f.replace('.json', ''));
      const contractDomains = contractFiles.map(f => f.replace('.json', ''));

      // Not all domains need contracts yet, but contracts should match existing manifests
      for (const contractDomain of contractDomains) {
        expect(manifestDomains).toContain(contractDomain);
      }
    });

    it('should have matching tool counts between contracts and manifests', () => {
      const contractFiles = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));

      for (const file of contractFiles) {
        const contractPath = join(CONTRACTS_DIR, file);
        const manifestPath = join(MANIFESTS_DIR, file);

        const contract: Contract = JSON.parse(readFileSync(contractPath, 'utf-8'));
        const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

        expect(contract.domain).toBe(manifest.domain);
        expect(contract.tools.length).toBe(manifest.toolCount);
      }
    });

    it('should have matching tool names between contracts and manifests', () => {
      const contractFiles = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));

      for (const file of contractFiles) {
        const contractPath = join(CONTRACTS_DIR, file);
        const manifestPath = join(MANIFESTS_DIR, file);

        const contract: Contract = JSON.parse(readFileSync(contractPath, 'utf-8'));
        const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

        const contractToolNames = contract.tools.map(t => t.name).sort();
        const manifestToolNames = manifest.tools.map(t => t.name).sort();

        expect(contractToolNames).toEqual(manifestToolNames);
      }
    });
  });

  describe('Error handling contracts', () => {
    it('should define error cases for tools requiring authentication', () => {
      const contractFiles = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));

      for (const file of contractFiles) {
        const path = join(CONTRACTS_DIR, file);
        const contract: Contract = JSON.parse(readFileSync(path, 'utf-8'));

        for (const tool of contract.tools) {
          const toolName = tool.name.toLowerCase();

          // Tools that require API keys should have error cases
          if (toolName.includes('openalex')) {
            const hasAuthError = tool.errorCases?.some(
              ec => ec.case === 'openalex_key_required' || ec.case.includes('key')
            );
            expect(hasAuthError).toBe(true);
          }
        }
      }
    });

    it('should define empty query error cases for search tools', () => {
      const contractFiles = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));

      for (const file of contractFiles) {
        const path = join(CONTRACTS_DIR, file);
        const contract: Contract = JSON.parse(readFileSync(path, 'utf-8'));

        for (const tool of contract.tools) {
          const toolName = tool.name.toLowerCase();

          // Search tools should handle empty queries
          if (toolName.includes('search')) {
            const hasEmptyQueryError = tool.errorCases?.some(
              ec => ec.case.includes('empty')
            );
            expect(hasEmptyQueryError).toBe(true);
          }
        }
      }
    });
  });

  describe('Rate limiting contracts', () => {
    it('should define rate limits for all tools', () => {
      const contractFiles = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));

      for (const file of contractFiles) {
        const path = join(CONTRACTS_DIR, file);
        const contract: Contract = JSON.parse(readFileSync(path, 'utf-8'));

        for (const tool of contract.tools) {
          expect(tool.rateLimits).toBeDefined();
          expect(tool.rateLimits!.requestsPerSecond).toBeGreaterThan(0);
        }
      }
    });

    it('should have appropriate rate limits for known APIs', () => {
      const literaturePath = join(CONTRACTS_DIR, 'literature.json');
      if (readdirSync(CONTRACTS_DIR).includes('literature.json')) {
        const contract: Contract = JSON.parse(readFileSync(literaturePath, 'utf-8'));

        const openalexTool = contract.tools.find(t => t.name === 'openalex_search_works');
        expect(openalexTool?.rateLimits?.requestsPerSecond).toBeLessThanOrEqual(2);

        const arxivTool = contract.tools.find(t => t.name === 'arxiv_search');
        expect(arxivTool?.rateLimits?.requestsPerSecond).toBeLessThanOrEqual(0.5);
      }
    });
  });

  describe('Schema structure', () => {
    it('should have required fields in output schemas', () => {
      const contractFiles = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));

      for (const file of contractFiles) {
        const path = join(CONTRACTS_DIR, file);
        const contract: Contract = JSON.parse(readFileSync(path, 'utf-8'));

        for (const tool of contract.tools) {
          const schema = tool.outputSchema as any;

          // Output schemas should specify required fields
          expect(schema.type).toBe('object');
          expect(schema.required).toBeDefined();
          expect(Array.isArray(schema.required)).toBe(true);
        }
      }
    });

    it('should have properties matching required fields', () => {
      const contractFiles = readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.json'));

      for (const file of contractFiles) {
        const path = join(CONTRACTS_DIR, file);
        const contract: Contract = JSON.parse(readFileSync(path, 'utf-8'));

        for (const tool of contract.tools) {
          const schema = tool.outputSchema as any;

          if (schema.required) {
            for (const requiredField of schema.required) {
              expect(schema.properties).toHaveProperty(requiredField);
            }
          }
        }
      }
    });
  });
});
