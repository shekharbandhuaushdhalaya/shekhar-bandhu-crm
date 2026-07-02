const fs = require('fs');
const content = fs.readFileSync('/Users/pawankeshar/Desktop/shekhar-bandhu-crm/admin-crm/app/inventories.tsx', 'utf8');

let line = 1;
let col = 1;
let stack = [];

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  if (char === '\n') {
    line++;
    col = 1;
  } else {
    col++;
  }

  if (char === '{') {
    stack.push({ line, col, type: '{' });
  } else if (char === '}') {
    if (stack.length === 0) {
      console.log(`Extra } at line ${line}, col ${col}`);
    } else {
      stack.pop();
    }
  }
}

if (stack.length > 0) {
  console.log(`Unmatched { count: ${stack.length}`);
  stack.slice(-5).forEach(s => {
    console.log(`Unmatched { at line ${s.line}, col ${s.col}`);
  });
} else {
  console.log('Braces are balanced!');
}
