const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'..','js','rtc.js'),'utf8');
function setup() {
  const handlers={};const elements=new Map();
  for(const id of ['status','join-btn','leave-btn','screen-btn','mute-btn','deafen-btn','voice-controls-row']) elements.set(id,{style:{},attributes:{},setAttribute(name,value){this.attributes[name]=value;},classList:{remove(){},add(){}}});
  elements.get('join-btn').style.display='none';elements.get('join-btn').disabled=true;
  const client={uid:123456,remoteUsers:[],on:(name,fn)=>handlers[name]=fn,async leave(){throw new Error('network lost');}};
  const mic={stopped:false,closed:false,stop(){this.stopped=true;},close(){this.closed=true;}};
  const window={isVoiceJoined:true,myAgoraUID:123456,addEventListener(){},appendMessage(){},claimPresenceIdentity:()=>new Promise(()=>{}),wakeLock:{release:()=>Promise.reject(new Error('released'))}};
  const context=vm.createContext({window,mic,console:{warn(){},error(){}},AgoraRTC:{createClient:()=>client},document:{addEventListener(){},getElementById:id=>elements.get(id)},setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(source,context);vm.runInContext('localTracks.audioTrack=mic;',context);
  return {window,context,mic,elements,handlers,client};
}
test('terminal disconnect closes the mic and restores Join even if presence is offline and leave rejects',async()=>{
  const {window,mic,elements,handlers}=setup();
  await handlers['connection-state-change']('DISCONNECTED','RECONNECTING');
  assert.equal(window.isVoiceJoined,false);assert.equal(mic.stopped,true);assert.equal(mic.closed,true);
  assert.equal(elements.get('join-btn').style.display,'flex');assert.equal(elements.get('join-btn').disabled,false);
  assert.equal(elements.get('leave-btn').style.display,'none');
  assert.equal(elements.get('voice-controls-row').style.display,'none');
  assert.equal(elements.get('voice-controls-row').hidden,true);
});
test('temporary reconnect does not close a live microphone',async()=>{
  const {window,mic,handlers}=setup();
  await handlers['connection-state-change']('RECONNECTING','CONNECTED');
  assert.equal(window.isVoiceJoined,true);assert.equal(mic.closed,false);
});

test('terminal disconnect restores local controls even when SDK leave never resolves',async()=>{
  const {window,mic,elements,handlers,client,context}=setup();
  vm.runInContext('isMuted=true; isDeafened=true; mutedBeforeDeafen=true; syncVoiceControls();',context);
  client.leave=()=>new Promise(()=>{});
  await handlers['connection-state-change']('DISCONNECTED','RECONNECTING');
  assert.equal(window.isVoiceJoined,false);assert.equal(mic.closed,true);
  assert.equal(elements.get('join-btn').disabled,false);
  for(const id of ['mute-btn','deafen-btn']) {
    assert.equal(elements.get(id).hidden,true);
    assert.equal(elements.get(id).style.display,'none');
    assert.equal(elements.get(id).attributes['aria-pressed'],'false');
  }
  assert.equal(vm.runInContext('isDeafened',context),false);
});
