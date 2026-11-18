/* Lossless session persistence. Story unlocks retain their existing independent key. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WakeariAutosave=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const KEY='wakeari-game-autosave-v1';
 function replacer(key,value){
  if(value instanceof Set)return {$wakeType:'Set',values:[...value]};
  if(value instanceof Map)return {$wakeType:'Map',values:[...value]};
  if(typeof value==='number'&&!Number.isFinite(value))return {$wakeType:'Number',value:String(value)};
  return value;
 }
 function reviver(key,value){
  if(value&&value.$wakeType==='Set'&&Array.isArray(value.values))return new Set(value.values);
  if(value&&value.$wakeType==='Map'&&Array.isArray(value.values))return new Map(value.values);
  if(value&&value.$wakeType==='Number'&&['Infinity','-Infinity','NaN'].includes(value.value))return Number(value.value);
  return value;
 }
 const encode=value=>JSON.stringify(value,replacer);
 function validState(s){return !!s&&Array.isArray(s.tiles)&&s.tiles.length===240&&s.tiles.every(t=>['wall','floor','room','entry','office','bedrock'].includes(t))&&['build','battle','result'].includes(s.phase)&&Number.isInteger(s.wave)&&s.wave>=0&&s.wave<15&&Number.isFinite(s.money)&&s.money>=0&&Number.isFinite(s.time)&&s.time>=0&&['rooms','units','enemies','queue','events','rewardedStages'].every(k=>Array.isArray(s[k]))&&s.fallen instanceof Set&&s.equip&&typeof s.equip==='object'&&s.units.every(u=>Number.isInteger(u.pos)&&u.pos>=0&&u.pos<240&&['pak','bibi','dos','pika','mie','mayo'].includes(u.kind))&&s.enemies.every(e=>Number.isInteger(e.pos)&&e.pos>=0&&e.pos<240&&['y','g','h','d','k','t'].includes(e.kind))}
 function decode(raw){try{const v=JSON.parse(raw,reviver);if(v?.version!==1||!validState(v.state))return null;if(v.battleSnapshot&&!validState(v.battleSnapshot))return null;if(v.checkpoint&&!validState(v.checkpoint))return null;if(v.presentation&&!(v.presentation.kind==='ending'||v.presentation.kind==='chapter'&&Number.isInteger(v.presentation.index)&&v.presentation.index>=0&&v.presentation.index<15))return null;return v}catch{return null}}
 function read(storage){try{return decode(storage.getItem(KEY))}catch{return null}}
 function write(storage,value){try{const raw=encode(value);if(!decode(raw))return false;storage.setItem(KEY,raw);return true}catch{return false}}
 function hasStored(storage){try{return storage.getItem(KEY)!==null}catch{return false}}
 return {KEY,encode,decode,read,write,hasStored,validState};
});
