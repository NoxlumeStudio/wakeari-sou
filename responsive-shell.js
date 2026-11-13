/* One logical game canvas: the frame art, 20x12 grid, text and input scale together. */
(()=>{
  'use strict';
  const DESIGN_WIDTH=1890, DESIGN_HEIGHT=1027;
  const viewport=document.getElementById('game-viewport');
  const fit=document.getElementById('game-fit');
  const frame=document.getElementById('game-frame');
  function resize(){
    const width=viewport.clientWidth-parseFloat(getComputedStyle(viewport).paddingLeft)-parseFloat(getComputedStyle(viewport).paddingRight);
    const height=viewport.clientHeight-parseFloat(getComputedStyle(viewport).paddingTop)-parseFloat(getComputedStyle(viewport).paddingBottom);
    const scale=Math.max(0.01,Math.min(width/DESIGN_WIDTH,height/DESIGN_HEIGHT));
    fit.style.width=`${DESIGN_WIDTH*scale}px`;
    fit.style.height=`${DESIGN_HEIGHT*scale}px`;
    frame.style.setProperty('--game-scale',scale);
    document.documentElement.dataset.gameScale=scale.toFixed(4);
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});
  window.visualViewport?.addEventListener('resize',resize,{passive:true});
  if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(viewport);
})();
