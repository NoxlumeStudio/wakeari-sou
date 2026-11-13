/* Deterministic route selection shared by the game and Node tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.MazeAI=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const walkable=t=>t==='floor'||t==='entry'||t==='office';
  function neighbours(p,tiles,w,h){const x=p%w,y=Math.floor(p/w),out=[];if(y>0)out.push([0,p-w]);if(x<w-1)out.push([1,p+1]);if(y<h-1)out.push([2,p+w]);if(x>0)out.push([3,p-1]);return out.filter(([,n])=>walkable(tiles[n]));}
  function shortest(from,to,tiles,w,h){if(from===to)return [from];const q=[from],seen=new Set(q),prev=new Map;for(let i=0;i<q.length;i++)for(const [,n] of neighbours(q[i],tiles,w,h)){if(seen.has(n))continue;seen.add(n);prev.set(n,q[i]);if(n===to){let result=[to];while(result[0]!==from)result.unshift(prev.get(result[0]));return result}q.push(n)}return null}
  function corridorVisible(from,to,tiles,w,h){const fx=from%w,fy=Math.floor(from/w),tx=to%w,ty=Math.floor(to/w);if(fx!==tx&&fy!==ty)return false;const dx=Math.sign(tx-fx),dy=Math.sign(ty-fy);let x=fx,y=fy;while(x!==tx||y!==ty){x+=dx;y+=dy;if(!walkable(tiles[y*w+x]))return false}return true}
  const edge=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  function nextStep({from,goal,kind,heading=1,nav={},tiles,width:w,height:h,guided=false,leader=null}){
    const options=neighbours(from,tiles,w,h);if(!options.length)return {pos:from,heading,reason:'blocked'};
    const signature=tiles.join('');if(nav.mapSignature!==signature){nav.mapSignature=signature;nav.stack=[from];nav.seenEdges=[];nav.deadEnds=[];nav.visits={};nav.steps=0}
    nav.stack??=[from];nav.seenEdges??=[];nav.deadEnds??=[];nav.visits??={};nav.steps=(nav.steps||0)+1;
    const shortestMove=()=>{let path=shortest(from,goal,tiles,w,h);if(!path||path.length<2)return null;let n=path[1];return {pos:n,heading:options.find(([d,p])=>p===n)?.[0]??heading,reason:'shortest'}};
    const remember=(move)=>{if(move&&move.pos!==from){const e=edge(from,move.pos);if(!nav.seenEdges.includes(e))nav.seenEdges.push(e);nav.visits[move.pos]=(nav.visits[move.pos]||0)+1;nav.lastPos=from}return move};
    if(kind==='h'||kind==='t'||guided)return remember(shortestMove()||{pos:from,heading,reason:'blocked'});
    if(kind==='k'&&leader&&leader.pos!==from){const path=shortest(from,leader.pos,tiles,w,h);if(path?.length>1){const p=path[1];return remember({pos:p,heading:options.find(([d,n])=>n===p)?.[0]??heading,reason:'follow',leaderId:leader.id})}}
    if(corridorVisible(from,goal,tiles,w,h))return remember(shortestMove());
    if(nav.steps>w*h*8)return remember(shortestMove()||{pos:from,heading,reason:'blocked'});
    const turns=kind==='y'?[1,0,3,2]:[0,1,3,2];
    const ordered=turns.map(t=>options.find(([d])=>d===(heading+t)%4)).filter(Boolean);
    let selected=ordered.find(([,p])=>!nav.deadEnds.includes(p)&&!nav.seenEdges.includes(edge(from,p)));
    if(selected){if(nav.stack.at(-1)!==from)nav.stack=[from];nav.stack.push(selected[1]);return remember({pos:selected[1],heading:selected[0],reason:'explore',turn:(selected[0]-heading+4)%4})}
    const parent=nav.stack.at(-2);if(parent!=null&&options.some(([,p])=>p===parent)){
      if(options.every(([,p])=>p===parent||nav.deadEnds.includes(p))&&!nav.deadEnds.includes(from))nav.deadEnds.push(from);
      nav.stack.pop();return remember({pos:parent,heading:options.find(([,p])=>p===parent)[0],reason:'backtrack',deadEnd:nav.deadEnds.includes(from)});
    }
    // A loop or an already-explored branch: bias toward the goal and guarantee progress.
    return remember(shortestMove()||{pos:from,heading,reason:'blocked'});
  }
  return {nextStep,shortest,corridorVisible,neighbours};
});
