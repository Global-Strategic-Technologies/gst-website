#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// Read projects.json
const projectsPath = path.join(process.cwd(), 'src/data/ma-portfolio/projects.json');
const data = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'));

// Function to abbreviate ARR value
function abbreviateARR(arrStr) {
  if (!arrStr || arrStr === 'Not in source' || arrStr === 'N/A') {
    return arrStr;
  }

  // Remove currency symbols and commas, extract numeric value
  let numericStr = arrStr.replace(/[$€£¥A,]/g, '').trim();
  
  // Extract multiplier
  let multiplier = 1;
  let suffix = '';
  
  if (/B$/i.test(numericStr)) {
    multiplier = 1000000000;
    numericStr = numericStr.replace(/B$/i, '').trim();
    suffix = 'B';
  } else if (/M$/i.test(numericStr)) {
    multiplier = 1000000;
    numericStr = numericStr.replace(/M$/i, '').trim();
    suffix = 'M';
  } else if (/K$/i.test(numericStr)) {
    multiplier = 1000;
    numericStr = numericStr.replace(/K$/i, '').trim();
    suffix = 'K';
  }

  const numeric = parseFloat(numericStr) * multiplier;
  
  // Determine currency symbol
  let currencySymbol = '$';
  if (arrStr.includes('€')) currencySymbol = '€';
  else if (arrStr.includes('£')) currencySymbol = '£';
  else if (arrStr.includes('¥')) currencySymbol = '¥';
  else if (arrStr.includes('A$')) currencySymbol = 'A$';

  // Convert to millions and abbreviate
  if (numeric >= 1000000000) {
    const billions = numeric / 1000000000;
    return `${currencySymbol}${billions.toFixed(1)}B`;
  } else if (numeric >= 1000000) {
    const millions = numeric / 1000000;
    return `${currencySymbol}${millions.toFixed(0)}M`;
  } else if (numeric >= 1000) {
    const thousands = numeric / 1000;
    return `${currencySymbol}${thousands.toFixed(0)}K`;
  } else {
    return `${currencySymbol}${numeric.toFixed(0)}`;
  }
}

// Update all projects
data.forEach(project => {
  if (project.arr && project.arr !== 'Not in source' && project.arr !== 'N/A') {
    project.arr = abbreviateARR(project.arr);
  }
});

// Write back to file
fs.writeFileSync(projectsPath, JSON.stringify(data, null, 2), 'utf-8');
console.log('✓ ARR values abbreviated in projects.json');
