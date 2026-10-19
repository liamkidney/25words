import { mkdir, copyFile } from 'node:fs/promises';
const output=process.env.SITE_OUT||'dist';
await mkdir(output,{recursive:true});
await copyFile('index.html',output+'/index.html');
