const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '../app');
const themeStrFloating = "...Shadows.floating";
const themeStrModal = "...Shadows.modal";
const themeStrCard = "...Shadows.card";

const regexFloating = /boxShadow:\s*['"]0px\s+6px\s+14px\s+rgba\(0,0,0,0.18\)['"]\s*,\s*elevation:\s*12/g;
const regexModal = /boxShadow:\s*['"]0px\s+10px\s+15px\s+rgba\(0,0,0,0.2\)['"]\s*,\s*elevation:\s*10/g;
const regexCard = /boxShadow:\s*['"]0px\s+4px\s+8px\s+rgba\(0,0,0,0.1\)['"]\s*,\s*elevation:\s*5/g;

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      if (regexFloating.test(content)) {
        content = content.replace(regexFloating, themeStrFloating);
        changed = true;
      }
      if (regexModal.test(content)) {
        content = content.replace(regexModal, themeStrModal);
        changed = true;
      }
      
      if (changed) {
        // Need to ensure Shadows is imported from theme
        if (!content.includes('Shadows') && content.includes('themeContext')) {
           // It's usually imported from '../constants/theme'
           if (content.includes("from '../constants/theme'")) {
              content = content.replace(/from '\.\.\/constants\/theme';/, " Shadows } from '../constants/theme';").replace(/,\s*Shadows/, ", Shadows");
           }
        }
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated shadows in ${fullPath}`);
      }
    }
  }
}

processDirectory(appDir);
console.log('Shadows replacement complete.');
