#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// Read projects.json
const projectsPath = path.join(process.cwd(), 'src/data/ma-portfolio/projects.json');
const data = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'));

// Sort by year descending (most recent first)
data.sort((a, b) => b.year - a.year);

// Write back to file
fs.writeFileSync(projectsPath, JSON.stringify(data, null, 2), 'utf-8');
console.log('✓ Projects sorted by year (descending)');
