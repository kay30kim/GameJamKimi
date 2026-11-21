// Offline authoring only: generate audio once, then serve static MP3 files.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const key=process.env.ELEVENLABS_API_KEY?.trim();
const voice=process.env.ELEVENLABS_VOICE_ID?.trim();
const model=process.env.ELEVENLABS_MODEL_ID?.trim()||'eleven_multilingual_v2';
if(!key||!voice){console.error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.local. No API requests were made.');process.exit(1);}
const stories=JSON.parse(await readFile('lib/demo/stories.json','utf8'));
const manifestPath='public/demo/audio/manifest.json';
await mkdir('public/demo/audio',{recursive:true});
let existing={};try{existing=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}
const manifest={};
for(const [lesson,nodes] of Object.entries(stories)) for(const [node,languages] of Object.entries(nodes)) for(const [language,text] of Object.entries(languages)){
 const id=`${lesson}-${node}-${language}`;
 const hash=createHash('sha256').update(JSON.stringify({text,voice,model})).digest('hex').slice(0,16);
 const file=`${id}-${hash}.mp3`;
 try {await access(`public/demo/audio/${file}`);manifest[id]=`/demo/audio/${file}`;continue;}catch{}
 const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:model}),signal:AbortSignal.timeout(60000)});
 if(!response.ok){console.error(`Audio generation stopped (${response.status}) at ${id}. Existing files are preserved; rerun to resume.`);process.exit(1);}
 await writeFile(`public/demo/audio/${file}`,Buffer.from(await response.arrayBuffer()));
 manifest[id]=`/demo/audio/${file}`;
 // Publish each successful clip so interrupted authoring can resume safely.
 await writeFile(manifestPath,JSON.stringify({...existing,...manifest},null,2)+'\n');
 console.log(`Prepared ${id}`);
}
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(`Ready: ${Object.keys(manifest).length} prerecorded narration clips. No runtime generation needed.`);
