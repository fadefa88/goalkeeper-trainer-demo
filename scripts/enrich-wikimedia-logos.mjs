#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WD = 'https://www.wikidata.org/w/api.php';
const WC = 'https://commons.wikimedia.org/w/api.php';
const IT = 'https://it.wikipedia.org/w/api.php';
const UA = 'goalkeeper-trainer-demo/1.0';

const args = Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const [k,...v]=x.slice(2).split('=');return [k,v.length?v.join('='):true]}));
const season = args.season || '2026';
const input = resolve(ROOT, args.input || `scripts/import-serie-abc-${season}.json`);
const logoDir = resolve(ROOT, args['logo-dir'] || 'assets/club-logos');

const sleep = ms => new Promise(r=>setTimeout(r,ms));
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(fc|ac|ssc|ss|us|asd|ssd|cfc|calcio|football club|club)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const uniq = a => [...new Set(a.filter(Boolean).map(x=>String(x).trim()).filter(Boolean))];
const strip = s => String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const namesOf = c => uniq([c.officialName,c.shortName,...(c.aliases||[])]);

async function json(base, params, tries=4){
  const u=new URL(base); Object.entries(params).forEach(([k,v])=>v!==undefined&&v!==null&&v!==''&&u.searchParams.set(k,String(v)));
  let last;
  for(let i=1;i<=tries;i++){
    try{const r=await fetch(u,{headers:{Accept:'application/json','User-Agent':UA},signal:AbortSignal.timeout(30000)});if(r.ok)return r.json();last=new Error(`${r.status} ${r.statusText}`);if(r.status!==429&&r.status<500)throw last}catch(e){last=e}
    await sleep(i*400);
  }
  throw last;
}

async function bytes(url){
  const r=await fetch(url,{headers:{Accept:'image/*','User-Agent':UA},signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);
  const b=Buffer.from(await r.arrayBuffer());
  await sharp(b,{failOn:'none'}).metadata();
  return b;
}

function nameScore(value,names){
  const n=norm(value); let best=0;
  for(const raw of names){const c=norm(raw);if(!c)continue;if(n===c)best=Math.max(best,100);else if(n.includes(c)||c.includes(n))best=Math.max(best,55);else{const a=new Set(n.split(' ')),b=new Set(c.split(' '));best=Math.max(best,[...a].filter(x=>b.has(x)).length*12)}}
  return best;
}

async function wikidataCandidates(club){
  const names=namesOf(club); const queries=uniq([...names,...names.slice(0,2).map(n=>`${n} calcio`)]).slice(0,5); const found=new Map();
  for(const q of queries){const d=await json(WD,{action:'wbsearchentities',format:'json',search:q,language:'it',uselang:'it',type:'item',limit:8,origin:'*'});for(const x of d.search||[])if(x.id&&!found.has(x.id))found.set(x.id,x);if(found.size>=12)break;await sleep(50)}
  const ids=[...found.keys()].slice(0,15); if(!ids.length)return [];
  const d=await json(WD,{action:'wbgetentities',format:'json',ids:ids.join('|'),props:'claims|labels|descriptions|aliases|sitelinks',languages:'it|en',sitefilter:'itwiki',origin:'*'});
  return ids.map(id=>{const e=d.entities?.[id]||{},s=found.get(id)||{},label=e.labels?.it?.value||e.labels?.en?.value||s.label||'',desc=e.descriptions?.it?.value||e.descriptions?.en?.value||s.description||'',aliases=[...(e.aliases?.it||[]).map(a=>a.value),...(e.aliases?.en||[]).map(a=>a.value)],logo=e.claims?.P154?.find(c=>c?.mainsnak?.datavalue?.value)?.mainsnak?.datavalue?.value||null,itwiki=e.sitelinks?.itwiki?.title||null;let score=nameScore(label,names);for(const a of aliases)score=Math.max(score,nameScore(a,names)-5);if(/calcio|calcistic|football|soccer/i.test(desc))score+=45;if(/italia|italian/i.test(desc))score+=12;if(logo)score+=25;if(itwiki)score+=5;return{id,label,desc,logo,itwiki,score}}).sort((a,b)=>b.score-a.score);
}

function metaValue(m,k){return strip(m?.[k]?.value)||null}
async function imageInfo(api,title){
  const d=await json(api,{action:'query',format:'json',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:512,iiextmetadatalanguage:'it',iiextmetadatafilter:'LicenseShortName|LicenseUrl|UsageTerms|Attribution|Artist|Credit',titles:title.startsWith('File:')?title:`File:${title}`,origin:'*'});
  const p=Object.values(d.query?.pages||{})[0],i=p?.imageinfo?.[0]; if(!i?.url&&!i?.thumburl)return null; const m=i.extmetadata||{};
  return {fileTitle:p.title,downloadUrl:i.thumburl||i.url,originalUrl:i.url||null,sourceUrl:i.descriptionurl||i.url||null,license:metaValue(m,'LicenseShortName')||metaValue(m,'UsageTerms'),licenseUrl:metaValue(m,'LicenseUrl'),attribution:metaValue(m,'Attribution')||metaValue(m,'Artist')||metaValue(m,'Credit')};
}

async function fromP154(c){if(!c?.logo)return null;const x=await imageInfo(WC,c.logo).catch(()=>null);return x?{...x,source:'wikidata-p154',wikidataId:c.id,wikipediaTitle:c.itwiki||null}:null}

async function fromItWiki(c,club){
  if(!c?.itwiki)return null;
  const d=await json(IT,{action:'query',format:'json',prop:'images',imlimit:'max',titles:c.itwiki,origin:'*'}).catch(()=>null); const p=Object.values(d?.query?.pages||{})[0]; if(!p)return null;
  const names=namesOf(club); const imgs=(p.images||[]).map(x=>({title:x.title,score:nameScore(x.title,names)+(/logo|stemma|crest|badge/i.test(x.title)?55:0)-(/stadio|squadra|team|kit|maglia|player|mappa/i.test(x.title)?80:0)})).filter(x=>x.score>=70).sort((a,b)=>b.score-a.score);
  for(const im of imgs.slice(0,5)){const x=await imageInfo(IT,im.title).catch(()=>null);if(x)return{...x,source:'itwiki-image',wikidataId:c.id,wikipediaTitle:c.itwiki}}
  return null;
}

async function fromCommons(club,c){
  const names=namesOf(club); let best=null;
  for(const q of uniq([names[0]&&`${names[0]} logo`,names[0]&&`${names[0]} stemma`,names[1]&&`${names[1]} logo`]).slice(0,3)){
    const d=await json(WC,{action:'query',format:'json',generator:'search',gsrsearch:q,gsrnamespace:6,gsrlimit:10,prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:512,iiextmetadatalanguage:'it',origin:'*'}).catch(()=>null);
    for(const p of Object.values(d?.query?.pages||{})){let score=nameScore(p.title,names)+(/logo|stemma|crest|badge/i.test(p.title)?55:0)-(/stadio|squadra|team|kit|maglia|player|mappa/i.test(p.title)?80:0);const i=p.imageinfo?.[0];if(score<85||(!i?.url&&!i?.thumburl))continue;const m=i.extmetadata||{};const hit={fileTitle:p.title,downloadUrl:i.thumburl||i.url,originalUrl:i.url||null,sourceUrl:i.descriptionurl||i.url||null,license:metaValue(m,'LicenseShortName')||metaValue(m,'UsageTerms'),licenseUrl:metaValue(m,'LicenseUrl'),attribution:metaValue(m,'Attribution')||metaValue(m,'Artist')||metaValue(m,'Credit'),source:'commons-search',wikidataId:c?.id||null,wikipediaTitle:c?.itwiki||null,score};if(!best||score>best.score)best=hit}
    if(best?.score>=130)break; await sleep(50);
  }
  return best;
}

async function resolveLogo(club){const cs=await wikidataCandidates(club),good=cs.filter(c=>c.score>=95);for(const c of good.slice(0,5)){const x=await fromP154(c);if(x)return x}for(const c of good.slice(0,3)){const x=await fromItWiki(c,club);if(x)return x}return fromCommons(club,good[0]||cs[0]||null)}

async function palette(buf){
  const {data,info}=await sharp(buf,{failOn:'none'}).resize(128,128,{fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true}); const bins=new Map();
  for(let i=0;i<data.length;i+=info.channels){const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];if(a<110)continue;const max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max?((max-min)/max):0,light=(max+min)/510;if(light>0.96&&sat<0.1)continue;const q=[r,g,b].map(v=>Math.min(255,Math.round(v/16)*16));const k=q.join(',');bins.set(k,(bins.get(k)||0)+1)}
  const colors=[...bins].map(([k,count])=>{const [r,g,b]=k.split(',').map(Number),max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max?((max-min)/max):0;return{r,g,b,count,score:count*(1+sat*2)}}).sort((a,b)=>b.score-a.score); const p=colors[0]||{r:17,g:17,b:17}; const s=colors.find(x=>Math.hypot(x.r-p.r,x.g-p.g,x.b-p.b)>=70)||{r:255,g:255,b:255}; const hex=x=>'#'+[x.r,x.g,x.b].map(v=>v.toString(16).padStart(2,'0')).join('');return{primary:hex(p),secondary:hex(s),candidates:colors.slice(0,8).map(x=>({color:hex(x),count:x.count}))};
}

const clubs=JSON.parse(await readFile(input,'utf8')); await rm(logoDir,{recursive:true,force:true}); await mkdir(logoDir,{recursive:true}); const manifest={},missing=[]; let found=0;
for(let i=0;i<clubs.length;i++){const c=clubs[i],label=c.shortName||c.officialName||c.id;process.stdout.write(`[${i+1}/${clubs.length}] ${label}: `);try{const hit=await resolveLogo(c);if(!hit){missing.push({id:c.id,name:label});console.log('non trovato');continue}const b=await bytes(hit.downloadUrl),pal=await palette(b);await sharp(b,{failOn:'none'}).resize(256,256,{fit:'inside',withoutEnlargement:true}).webp({quality:92,alphaQuality:100}).toFile(resolve(logoDir,`${c.id}.webp`));Object.assign(c,{logoPath:`/assets/club-logos/${c.id}.webp`,logoSourceUrl:hit.sourceUrl,logoProvider:hit.source,wikidataId:hit.wikidataId||null,wikipediaTitle:hit.wikipediaTitle||null,logoFileTitle:hit.fileTitle||null,logoLicense:hit.license||null,logoLicenseUrl:hit.licenseUrl||null,logoAttribution:hit.attribution||null,colorPrimary:pal.primary,colorSecondary:pal.secondary,colorsSource:'adapted',colorsNote:'Palette ricavata automaticamente dallo stemma risolto tramite Wikidata/Wikimedia.',colorsVerifiedAt:new Date().toISOString(),logoPaletteCandidates:pal.candidates});manifest[c.id]={name:label,path:c.logoPath,source:hit.source,wikidataId:hit.wikidataId||null,wikipediaTitle:hit.wikipediaTitle||null,fileTitle:hit.fileTitle||null,sourceUrl:hit.sourceUrl,license:hit.license||null,licenseUrl:hit.licenseUrl||null,attribution:hit.attribution||null,colorPrimary:pal.primary,colorSecondary:pal.secondary,scrapedAt:new Date().toISOString()};found++;console.log(`OK [${hit.source}] ${hit.wikidataId||'-'} -> ${pal.primary} / ${pal.secondary}`)}catch(e){missing.push({id:c.id,name:label,error:e.message});console.log(`ERRORE: ${e.message}`)}await sleep(75)}
await writeFile(input,JSON.stringify(clubs,null,2)+'\n');await writeFile(resolve(logoDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(resolve(logoDir,'missing.json'),JSON.stringify(missing,null,2)+'\n');console.log(`\nLogo Wikimedia trovati: ${found}/${clubs.length}`);console.log(`Logo mancanti: ${missing.length}`);if(found<Math.min(40,Math.ceil(clubs.length*0.4)))process.exit(2);
