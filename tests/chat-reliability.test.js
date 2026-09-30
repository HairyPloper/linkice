const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname,'..','js','chat.js'),'utf8');
const section = (start,end) => source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const quiet = {error(){},warn(){}};
const sending = require('./helpers/chat-delivery');
test('rapid sends do not duplicate messages or erase the next draft',async()=>{
  const {window,input,pending,type}=sending();
  type('first message');
  const first=window.sendMessage();await window.sendMessage();
  assert.equal(pending.length,1);assert.equal(input.value,'');
  type('next draft');pending[0].resolve();await first;
  assert.equal(input.value,'next draft');
  await window.sendMessage();pending[1].resolve();
  assert.equal(pending[1].data.text,'next draft');assert.equal(input.value,'');
});
test('failed sends retain their outgoing copy and allow retry',async()=>{
  const {window,pending,type,delivery,session}=sending();
  type('first message');await window.sendMessage();pending[0].reject(new Error('offline'));
  await new Promise(setImmediate);
  assert.equal(delivery().dataset.state,'failed');assert.ok([...session.values()][0].includes('first message'));
  delivery().children[1].onclick();pending[1].resolve();await new Promise(setImmediate);
  assert.equal(pending.length,2);assert.equal(pending[0].id,pending[1].id);
  assert.equal(delivery().dataset.state,'sent');
});
test('hanging or rejected notification registration does not block chat',async()=>{
  for(const registration of [()=>new Promise(()=>{}),()=>Promise.reject(new Error('permission'))]) {
    const {window,pending,type}=sending();
    type('first message');
    window.notificationManager={ensurePushSubscription:registration,triggerGlobalPush(){}};
    const send=window.sendMessage();assert.equal(pending.length,1);pending[0].resolve();await send;
    assert.equal(pending[0].data.timestamp['.sv'],'timestamp');
  }
});
test('votes wait for a successful commit, suppress double clicks, and permit retries',async()=>{
  const saved=new Map();const pending=[];const errors=[];
  const context=vm.createContext({console:quiet,window:{chatRef:{child:()=>({transaction:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))})},appendMessage:(...args)=>errors.push(args)},getPollVoteKey:x=>x,localStorage:{getItem:key=>saved.get(key),setItem:(key,v)=>saved.set(key,v)}});
  vm.runInContext(section('const pendingVotes','// FILE UPLOAD'),context);
  const vote=context.window.vote;
  const first=vote('poll','option');await vote('poll','option');assert.equal(pending.length,1);
  pending[0].reject(new Error('denied'));await first;assert.equal(saved.size,0);
  const aborted=vote('poll','option');pending[1].resolve({committed:false});await aborted;assert.equal(saved.size,0);
  const retry=vote('poll','option');pending[2].resolve({committed:true});await retry;
  assert.equal(saved.get('voted_poll'),'true');await vote('poll','option');assert.equal(pending.length,3);
});
test('historical and out-of-round messages cannot win the current whiteboard game',()=>{
  let incoming;const wins=[];let game={active:true,roundId:'new',startedAt:1000,endsAt:2000,word:'petak',drawer:'Drawer',drawerSessionId:'111111'};
  const chatRef={orderByKey(){return this;},limitToLast(){return this;},on(event,fn){if(event==='child_added')incoming=fn;},once:async()=>({forEach(){},numChildren:()=>0}),push:data=>wins.push(data)};
  const gameRef={transaction(update,complete){const next=update(game);if(next!==undefined){game=next;complete?.(null,true,{val:()=>next});}}};
  const window={CHANNEL:'test',myAgoraUID:222222,uidNameMap:{},appendSystemHTML(){},appendMessage(){}};
  const context=vm.createContext({window,welcomeArt:'',document:{getElementById:()=>null},clearInterval(){},firebase:{database:()=>({ref:p=>p.startsWith('messages/')?chatRef:p.startsWith('whiteboard-game/')?gameRef:{on(){}}})}});
  vm.runInContext(section('const CHAT_PAGE_SIZE','function startPresenceListener()'),context);context.startChat();
  for(const timestamp of [undefined,500,2500]) incoming({key:`old-${timestamp}`,val:()=>({username:'Player',text:'petak',timestamp})});
  assert.equal(wins.length,0);assert.equal(game.active,true);
  incoming({key:'current',val:()=>({username:'Player',text:'petak',timestamp:1500})});assert.equal(wins.length,1);assert.equal(game,null);
});
