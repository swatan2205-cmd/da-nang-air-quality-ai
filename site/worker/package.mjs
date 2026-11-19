import fs from 'node:fs/promises'
import path from 'node:path'
import {build} from 'esbuild'

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
  '.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'}
const assets={}
for (const name of await fs.readdir('dist',{recursive:true})) {
  if (name !== 'index.html' && !name.replaceAll('\\','/').startsWith('assets/')) continue
  const type=mime[path.extname(name)]
  if (type) assets['/'+name.replaceAll('\\','/')]=[type,(await fs.readFile(path.join('dist',name))).toString('base64')]
}
const constants=await fs.readFile('worker/data.json','utf8')
await fs.writeFile('worker/generated.mjs','export const assets='+JSON.stringify(assets)+'; export const {bands,snapshot,modelInfo}='+constants)
await build({entryPoints:['worker/index.mjs'],outfile:'dist/server/index.js',bundle:true,minify:true,format:'esm',target:'es2022'})
await fs.mkdir('dist/.openai',{recursive:true})
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json')
