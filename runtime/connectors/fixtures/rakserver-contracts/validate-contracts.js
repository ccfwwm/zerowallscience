const fs = require('fs');
const path = require('path');

const contractsDir = path.join(__dirname, 'contracts');
const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.json'));

let totalTools = 0;
const results = [];
let hasErrors = false;

files.forEach(file => {
  try {
    const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
    const data = JSON.parse(content);
    
    // Validate required fields
    if (!data.domain || !data.version || !data.description || !Array.isArray(data.tools)) {
      console.error(`❌ ${file}: Missing required fields`);
      hasErrors = true;
      return;
    }
    
    // Validate each tool
    data.tools.forEach((tool, idx) => {
      if (!tool.name || !tool.inputSchema || !tool.outputSchema || !tool.rateLimits) {
        console.error(`❌ ${file}: Tool ${idx} missing required fields`);
        hasErrors = true;
      }
    });
    
    totalTools += data.tools.length;
    results.push({ domain: data.domain, file, count: data.tools.length });
  } catch (e) {
    console.error(`❌ ${file}: ${e.message}`);
    hasErrors = true;
  }
});

results.sort((a, b) => a.domain.localeCompare(b.domain));

console.log('✅ Rakserver Contract Validation:\n');
results.forEach(r => console.log(`  ✓ ${r.domain.padEnd(25)} ${r.count.toString().padStart(2)} tools`));
console.log(`\n📊 Total: ${totalTools} tools across ${results.length} domains`);

if (totalTools === 247 && results.length === 23 && !hasErrors) {
  console.log('✅ All contracts valid! 247 tools across 23 domains.');
  process.exit(0);
} else {
  console.error('❌ Validation failed!');
  process.exit(1);
}
