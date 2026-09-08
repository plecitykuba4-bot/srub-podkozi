// Adaptováno z fitness-app/scripts/backup-postgres.mjs pro nový SQLite projekt.
// Stejný postup: konzistentní online záloha, datum v názvu, 14denní retence.
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync,readdirSync,statSync,unlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,process.env.DATA_DIR||'data','srub.sqlite');
if(!existsSync(source))throw new Error('Databáze neexistuje. Nejdřív spusťte aplikaci.');
const target=resolve(root,process.env.BACKUP_DIRECTORY||'data/backups');
mkdirSync(target,{recursive:true,mode:0o700});
const days=Number(process.env.BACKUP_RETENTION_DAYS||14);
if(!Number.isInteger(days)||days<1)throw new Error('Retence musí být celé kladné číslo dnů.');
const file=join(target,'srub-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,file);}finally{db.close();}
const check=new DatabaseSync(file,{readOnly:true});
try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Kontrola zálohy selhala.');}finally{check.close();}
for(const entry of readdirSync(target,{withFileTypes:true})){
 if(!entry.isFile()||!/^srub-\d{4}-\d{2}-\d{2}T[\dZ-]+\.sqlite$/.test(entry.name))continue;
 const old=resolve(target,entry.name);
 if(dirname(old)!==target)throw new Error('Neplatná cesta zálohy.');
 if(old!==file&&statSync(old).mtimeMs<Date.now()-days*86400000)unlinkSync(old);
}
console.log('Ověřená záloha: '+file);
