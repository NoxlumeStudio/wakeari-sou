/* Story presentation is isolated from the battle simulation. */
const StoryUI=(()=>{
 'use strict';
 const chapters=[
  ['立ち退きません！','story_01_opening', ['ヨシダ：「こんにちはー！ 立ち退きのお願いに来ました！」','大家さん：「あらまあ。うちは引っ越しませんよ？」','ヨシダ：「えっ……でも、会社から絶対にハンコをもらえって……」','パクゾー：「……うるさいな。昼寝の邪魔するなよ」'],'最初の立ち退き業者がやってきた！ わけあり荘を守ろう！'],
  ['寝起きのドスンガ','story_02_dosunga',['ヨシダ：「今度こそ立ち退いてもらいます！」','大家さん：「あら、またいらしたの？」','ドスンガ：「……ドス……ドス……」','パクゾー：「おい、そいつ起こすなよ。面倒だから」'],'新しい住人ドスンガが仲間に！ ただし、起こすと大変？'],
  ['ベテランの勘',null,['ゲン：「新人ばかりじゃ埒が明かん。俺が行こう」','ヨシダ：「さすがゲンさん！ 罠にも詳しいんですよね！」','ゲン：「こんな古臭い罠、俺には通じん」','大家さん：「あら。じゃあ新しい罠も置いてみましょうか」']],
  ['近道のつもりが',null,['ヨシダ：「今度こそ最短ルートで行きます！」','大家さん：「こちらの道の方が近いかもしれませんよ？」','ヨシダ：「本当ですか！ ありがとうございます！」','ゲン：「おい！ 敵の言うことを聞くな！」']],
  ['地下の評判',null,['ヨシダ：「あのアパート、絶対おかしいです！」','ゲン：「住人も変だが、間取りも変だ」','大家さん：「褒めていただいて光栄です」','ゲン：「褒めとらん！」']],
  ['修理屋ピカピカリ','story_06_pikapikari',['ピカピカリ：「あーっ！ 誰ですか、この設備を壊したの！」','大家さん：「立ち退き業者さんですって」','ピカピカリ：「許せません！ 全部ピカピカに直してあげます！」','ゲン：「……修理するのか。面倒なことになったな」']],
  ['壊し屋、参上',null,['権田：「どけどけ！ 壁も設備もぶっ壊してやる！」','ピカピカリ：「壊したそばから直します！」','権田：「なら、また壊す！」','大家さん：「仲良くしないでくださいね」']],
  ['立ち退きは力ずく？','story_08_gonda',['権田：「面倒な仕掛けが多すぎる！」','パクゾー：「こっちだって面倒なんだよ……」','ビビリーヌ：「た、大変！ また来たぁぁぁ！」','ドスンガ：「……誰だ、起こしたのは」']],
  ['ミエッパの豪華なお部屋','story_09_mieppa',['ミエッパ：「どう？ この素敵なお部屋！」','ヨシダ：「わあ……ちょっと見てみたいです」','大家さん：「あら、立ち退きのお仕事は？」','ミエッパ：「そんなことより、私の部屋を見なさい！」']],
  ['ハンコ主任の出番',null,['ハンコ主任：「君たち、何度失敗すれば気が済むんだね！」','ヨシダ：「す、すみません！」','ハンコ主任：「今回こそ、立ち退きのハンコをもらう！」','大家さん：「うちはハンコより、お弁当の方がありがたいですねえ」']],
  ['会社の面子',null,['ハンコ主任：「立花部長に知られたら、我々は終わりだ……」','ゲン：「もう知られているらしいぞ」','ヨシダ：「えっ！？ 部長が！？」','大家さん：「あら、ずいぶん偉い方が来るんですね」']],
  ['迷子のマヨイモ','story_12_mayoimo',['マヨイモ：「あれぇ……ここ、どこだっけぇ……」','大家さん：「マヨイモちゃん、お部屋はあちらですよ」','ヨシダ：「助けて！ 僕まで道が分からなくなった！」','マヨイモ：「じゃあ、一緒に迷おっかぁ」']],
  ['立ち退き最終通告',null,['ハンコ主任：「これが最後の通告です！」','大家さん：「もう何回目の最後ですかねえ」','ハンコ主任：「次は立花部長が直接来ます！」','パクゾー：「……偉い奴なら静かに歩いてくれるのか？」']],
  ['立花部長、現る！','story_14_tachibana',['立花部長：「ずいぶん手間をかけさせてくれたようですね」','大家さん：「あら、部長さん。お茶でもいかが？」','立花部長：「結構です。この建物は必ず明け渡していただきます」','大家さん：「それなら、まず住人たちとお話ししてくださいな」']],
  ['わけあり荘、最後の一日','story_15_finalbattle',['立花部長：「これが本当に最後です。全員、突入！」','ヨシダ：「部長！ 僕、もうこのアパート怖いです！」','ドスンガ：「……騒がしい連中だな」','大家さん：「みんな、今日は少しだけ頑張りましょうね」'],'この地下には、守りたい暮らしがある。']
 ];
 const ending={title:'立ち退きませんでした！',image:'story_ending',lines:['ヨシダ：「部長……もう、帰りましょうよ……」','立花部長：「……分かりました。立ち退き計画は撤回します」','大家さん：「あらまあ。それはよかった」','パクゾー：「……やっと静かに寝られる」','ビビリーヌ：「やったぁぁぁ！！」','ドスンガ：「うるさい！！！」','こうして、わけあり荘に平和が戻った。','少し変わった住人たちと、少し変わった大家さん。','地下の暮らしは、今日もにぎやかだ。','『立ち退きません！』　THE END']};
 // Newly supplied chapter illustrations; dialogue and scene timing remain unchanged.
 for(const [chapter,image] of [[3,'story_03'],[4,'story_04'],[5,'story_05'],[7,'story_07'],[10,'story_10'],[11,'story_11'],[13,'story_13']]) chapters[chapter-1][1]=image;
 const storageKey='wakeari-story-unlocked-v1';let maxReached=1,endingUnlocked=false;
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');maxReached=Math.max(1,Math.min(15,Number(saved.maxReached)||1));endingUnlocked=!!saved.endingUnlocked}catch{}
 let overlay=null,previousFocus=null,currentPresentation=null,sessionListener=null;
 function save(){try{localStorage.setItem(storageKey,JSON.stringify({maxReached,endingUnlocked}))}catch{}}
 function reached(index){maxReached=Math.max(maxReached,Math.min(15,index+1));save()}
 function ensure(){if(overlay)return overlay;overlay=document.createElement('section');overlay.className='story-overlay hidden';overlay.id='storyOverlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','物語');document.body.append(overlay);return overlay}
 function close(){currentPresentation=null;if(!overlay)return;overlay.classList.add('hidden');overlay.innerHTML='';previousFocus?.focus?.();sessionListener?.()}
 function imageTag(name){return name?`<img class="story-still" src="assets/story/${name}.webp" alt="物語の挿絵" onerror="this.parentElement.classList.add('story-no-image');this.remove()">`:''}
 function display(title,image,lines,note,buttonText,onDone,fromArchive=false){previousFocus=document.activeElement;let box=ensure();box.classList.remove('hidden');const longScene=lines.length>5;box.innerHTML=`<div class="story-card story-scene${longScene?' story-ending':''}${note?' story-with-note':''}"><div class="story-art ${image?'':'story-no-image'}">${imageTag(image)}</div><div class="story-header">${title}</div><div class="story-dialogue">${lines.map(x=>`<p>${escape(x)}</p>`).join('')}${note?`<div class="story-note">${escape(note)}</div>`:''}</div><div class="story-controls"><button type="button" class="story-primary">${buttonText}</button></div></div>`;box.querySelector('button').onclick=()=>{if(typeof WakeariAudio!=='undefined')WakeariAudio.playSfx('ui_click');close();onDone?.()};box.querySelector('button').focus();sessionListener?.()}
 function escape(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function showChapter(index){if(index<0||index>=15)return;currentPresentation={kind:'chapter',index};reached(index);const [title,image,lines,note]=chapters[index];display(`第${index+1}話　${title}`,image,lines,note,'防衛準備へ')}
 function showEnding(onTitle){currentPresentation={kind:'ending'};endingUnlocked=true;save();display(ending.title,ending.image,ending.lines,null,'タイトルへ戻る',onTitle)}
 function showTitle(onStart){display('立ち退きません！ ～地下のわけあり荘～','story_01_opening',['わけあり荘へようこそ。','住人たちと一緒に、全15話を守り抜こう！'],null,'はじめる',onStart)}
 function openArchive(currentIndex){currentPresentation=null;reached(currentIndex);const box=ensure();previousFocus=document.activeElement;box.classList.remove('hidden');box.innerHTML=`<div class="story-card story-archive"><div class="story-header">物語を振り返る</div><p class="story-archive-help">到達した物語をいつでも見返せます。戦闘や管理費は変わりません。</p><div class="story-archive-list">${chapters.map(([title],i)=>`<button type="button" data-story-index="${i}" ${i>=maxReached?'disabled':''}>第${i+1}話　${escape(title)}${i>=maxReached?' 🔒':''}</button>`).join('')}<button type="button" data-story-ending ${endingUnlocked?'':'disabled'}>エンディング${endingUnlocked?'':' 🔒'}</button></div><div class="story-controls"><button type="button" class="story-primary" data-story-close>閉じる</button></div></div>`;box.querySelector('[data-story-close]').onclick=()=>{if(typeof WakeariAudio!=='undefined')WakeariAudio.playSfx('ui_click');close()};box.querySelectorAll('[data-story-index]').forEach(b=>b.onclick=()=>{if(typeof WakeariAudio!=='undefined')WakeariAudio.playSfx('ui_click');const i=Number(b.dataset.storyIndex),[title,image,lines,note]=chapters[i];display(`第${i+1}話　${title}`,image,lines,note,'回想を閉じる',undefined,true)});const end=box.querySelector('[data-story-ending]');end.onclick=()=>{if(typeof WakeariAudio!=='undefined')WakeariAudio.playSfx('ui_click');display(ending.title,ending.image,ending.lines,null,'回想を閉じる',undefined,true)};box.querySelector('[data-story-close]').focus()}
 function restore(snapshot,onTitle){
  if(snapshot?.kind==='chapter'&&chapters[snapshot.index]){const [title,image,lines,note]=chapters[snapshot.index];currentPresentation={kind:'chapter',index:snapshot.index};display(`第${snapshot.index+1}話　${title}`,image,lines,note,'防衛準備へ')}
  else if(snapshot?.kind==='ending'){currentPresentation={kind:'ending'};display(ending.title,ending.image,ending.lines,null,'タイトルへ戻る',onTitle)}
 }
 return {snapshot:()=>overlay&&!overlay.classList.contains('hidden')?currentPresentation:null,restore,onSessionChange:fn=>{sessionListener=fn},showChapter,showEnding,showTitle,openArchive,reached,close,isOpen:()=>!!overlay&&!overlay.classList.contains('hidden'),chapters,ending};
})();
