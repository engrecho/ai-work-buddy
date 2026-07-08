const fs = require('fs');
const parser = require('@babel/parser');
const lines = fs.readFileSync('src/pages/ReadingPage.jsx', 'utf8').split('\n');
const closes = ['</div>', '</span>', '</button>', '</form>', '</DialogContent>', '</Dialog>', '</DialogTrigger>', '</a>', '</label>', '</select>', '</textarea>', '</p>', '</AlertDialog>', '</AlertDialogContent>', '</AlertDialogHeader>', '</AlertDialogTitle>', '</AlertDialogDescription>', '</AlertDialogFooter>', '</AlertDialogCancel>', '</AlertDialogAction>', '</DialogHeader>', '</DialogTitle>', '</DialogDescription>', '</DialogFooter>', '</Textarea>', '</Input>', '</Button>', '</Plus>', '</Wand2>', '</Sparkles>', '</Menu>', '</ChevronDown>', '</X>', '</BookOpen>', '</SideItem>', '</AlertTriangle>', '</Check>', '</Eye>', '</Download>', '</RefreshCw>', '</Star>', '</Tag>', '</Loader2>', '</FolderOpen>', '</Pencil>', '</Plus>'];
function parseErr(arr) {
  try { parser.parse(arr.join('\n'), { sourceType: 'module', plugins: ['jsx', 'typescript'] }); return null; }
  catch (e) { return e.loc ? e.loc.line : 99999; }
}
let content = lines.slice();
let applied = [];
for (let iter = 0; iter < 15; iter++) {
  const err = parseErr(content);
  if (err === null) { console.log('PARSED after insertions:', applied); process.exit(0); }
  let best = null;
  for (let p = 0; p <= content.length; p++) {
    for (const c of closes) {
      const t = content.slice(); t.splice(p, 0, c);
      if (parseErr(t) === null) { console.log('FIXED by inserting', c, 'at line', p + 1); console.log('applied so far:', applied.concat([[p + 1, c]])); process.exit(0); }
    }
  }
  // no single fix; pick insertion that pushes error furthest down
  let bestProg = -1, bestAct = null;
  for (let p = 0; p <= content.length; p++) {
    for (const c of closes) {
      const t = content.slice(); t.splice(p, 0, c);
      const e = parseErr(t);
      if (e !== null && e > bestProg) { bestProg = e; bestAct = [p, c]; }
    }
  }
  if (!bestAct) { console.log('no progress possible; stuck at line', err); break; }
  content.splice(bestAct[0], 0, bestAct[1]);
  applied.push([bestAct[0] + 1, bestAct[1]]);
  console.log('iter', iter, 'insert', bestAct[1], 'at', bestAct[0] + 1, '-> error now at', bestProg);
}
console.log('final applied:', applied);
