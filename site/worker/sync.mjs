// For authenticated job runners. Pass the Site service token on stdin only.

const origin='https://da-nang-air-quality-ai.nitia-gpt-pr-6208.chatgpt.site'
// Hide terminal echo for interactive execution.
let input=''
if(process.stdin.isTTY) process.stdin.setRawMode(true)
process.stderr.write('Ready for private Site service access on stdin.\n')
for await(const chunk of process.stdin){
  input+=chunk.toString()
  if(/[\r\n]/.test(input)) break
}
if(process.stdin.isTTY) process.stdin.setRawMode(false)
const headers={'OAI-Sites-Authorization':'Bearer '+input.trim(),'Content-Type':'application/json'}

const result=await fetch(origin+'/api/system/sync',{method:'POST',redirect:'error',headers})
if(!result.ok) throw Error('Sync HTTP '+result.status+': '+(await result.text()).slice(0,100))
const verify=await fetch(origin+'/api/system/status',{redirect:'error',headers})
const status=await verify.json()
if(!status.data?.archived_at || Math.abs(Date.now()-Date.parse(status.data.archived_at))>1200000)
  throw Error('Archive readback failed')
console.log(JSON.stringify({saved:(await result.json()).data.saved,archived_at:status.data.archived_at}))
