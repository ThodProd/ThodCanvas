'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_PIXELS=64_000_000,MAX_LAYER_PIXELS=160_000_000,MAX_HISTORY=50;
const state={w:0,h:0,name:'Изображение',layers:[],active:null,selection:null,selectionBlob:null,selectionBounds:null,selectionObject:false,crop:null,history:[],index:-1,busy:false,gesture:null,tool:'move',selectMode:'rect',bgMode:'ai',scale:1,x:0,y:0,space:false,job:null,dirty:false,textEdit:null};
const screen=$('screen'),viewport=$('viewport'),ctx=screen.getContext('2d');
const overlay=document.createElement('canvas');overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
viewport.insertBefore(overlay,$('welcome'));const ox=overlay.getContext('2d');
document.body.dataset.theme=new URLSearchParams(location.search).get('theme')==='dark'?'dark':'light';

const tools=[
 ['hand','Рука','H','<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v6m0-3a1.5 1.5 0 0 1 3 0v5c0 5-3 8-8 8h-1c-3 0-5-2-6.5-4.5L4 15a1.6 1.6 0 0 1 2.7-1.7L8 15"/>'],
 ['move','Перемещение','V','<path d="m12 2 3 3m-3-3L9 5m3-3v20m0 0-3-3m3 3 3-3M2 12l3-3m-3 3 3 3M2 12h20m0 0-3-3m3 3-3 3"/>'],
 ['crop','Кадрирование','C','<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>'],
 ['brush','Кисть','B','<path d="m9 15 10-12 3 3-12 11M9 15c-6-2-3 6-7 6 7 2 10-2 7-6z"/>'],
 ['eraser','Ластик','E','<path d="m3 14 11-11 8 8-10 11H9zm5-5 8 8M12 22h10"/>'],
 ['erase','Стереть','X','<path d="m4 15 10-10 7 7-8 9H9zM16 3v3M14 5h3M20 7v3M18 8h3"/>'],
 ['fill','Заливка','G','<path d="m4 12 7-7 8 8-7 7a2 2 0 0 1-2.8 0L4 15a2 2 0 0 1 0-3z"/><path d="M8 8V4l4-1v5"/><path d="M19 15s2 2.3 2 3.8a2 2 0 0 1-4 0C17 17.3 19 15 19 15z"/>'],
 ['text','Текст','T','<path d="M3 6V3h18v3M12 3v18m-5 0h10"/>'],
 ['select','Выделение','M','<path stroke-dasharray="3 3" d="M3 3h18v18H3z"/>'],
 ['background','Удаление фона','W','<path d="M4 20 14 10l3 3L7 23"/><path d="M17 2v4M15 4h4M20 8v4M18 10h4M3 9h4M5 7v4"/>']
];
const ICON={
 eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
 eyeOff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
 lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
 unlock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
 up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
 down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
 copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
 trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>'
};
$('tools').innerHTML=tools.map(([id,name,key,icon])=>`<button data-tool="${id}" title="${esc(name)}${key?' ('+key+')':''}" aria-label="${esc(name)}" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></button>`).join('');
$('palette').innerHTML=['#24262b','#ffffff','#3676e8','#d9545e','#e2b65f','#4f9c82','#9271bb','#f28a48'].map(c=>`<button data-color="${c}" style="background:${c}" title="${c}" aria-label="Цвет ${c}"></button>`).join('');
const FONTS=['Segoe UI','Arial','Calibri','Cambria','Candara','Consolas','Courier New','Georgia','Impact','Tahoma','Times New Roman','Trebuchet MS','Verdana','Comic Sans MS'];
$('font').innerHTML=FONTS.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');
const textEditor=document.createElement('textarea');
textEditor.id='text-editor';textEditor.spellcheck=false;textEditor.hidden=true;textEditor.setAttribute('aria-label','Ввод текста на холсте');
viewport.append(textEditor);
const textCaret=document.createElement('div');
textCaret.id='text-caret';textCaret.hidden=true;
viewport.append(textCaret);

function canvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;}
const blob=c=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Не удалось сохранить холст в память.')),'image/png'));
const dataUrl=b=>new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=reject;f.readAsDataURL(b);});
async function fromBlob(b){const image=await createImageBitmap(b);const c=canvas(image.width,image.height);c.getContext('2d').drawImage(image,0,0);image.close();return c;}
function fromDataUrl(s){const parts=s.split(',');if(parts.length!==2||!parts[0].startsWith('data:image/png;base64'))throw Error('Неверное изображение проекта.');const raw=atob(parts[1]);return new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:'image/png'});}
function active(){const l=state.layers.find(l=>l.id===state.active);if(!l)throw Error('Выберите слой.');return l;}
function activeOrNull(){return state.layers.find(l=>l.id===state.active)??null;}
function editable(){const l=active();if(l.locked)throw Error('Слой заблокирован. Нажмите замок рядом с ним.');if(!l.visible)throw Error('Включите видимость слоя.');return l;}
function checkSize(w,h){if(w<1||h<1||w>16384||h>16384||w*h>MAX_PIXELS)throw Error('Поддерживается до 64 Мп и 16384 px по стороне. Изображение не уменьшалось — выберите меньший исходник.');}
function checkBudget(extra=0){if(state.layers.reduce((s,l)=>s+l.canvas.width*l.canvas.height,extra)>MAX_LAYER_PIXELS||state.layers.length>=32)throw Error('Достигнут лимит памяти слоёв. Сохраните проект и удалите ненужные слои. Качество автоматически не уменьшается.');}
function makeLayer(c,name,kind='raster',extra={}){checkBudget(c.width*c.height);return {id:crypto.randomUUID(),name,kind,x:0,y:0,opacity:1,visible:true,locked:false,canvas:c,blob:null,baseBlob:null,modified:true,...extra};}
function addLayer(l,index=state.layers.length){state.layers.splice(index,0,l);state.active=l.id;}
function setDirty(value){state.dirty=value;thodHub.call('state.dirty',{dirty:value}).catch(()=>{if(value)status('Для защиты несохранённых изменений обновите ThodHUB до 0.1.1.');});}
function status(s){$('status').textContent=s;}
async function message(text,confirm=false){if($('message-dialog').open)return false;$('message-title').textContent=confirm?'Продолжить?':'ThodCanvas';$('message-text').textContent=text;$('message-cancel').hidden=!confirm;const d=$('message-dialog');d.showModal();return await new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'),{once:true}));}
function setBusy(label){state.busy=true;$('busy').hidden=false;$('busy-label').textContent=label;$('progress').removeAttribute('value');$('cancel').hidden=true;$('cancel').disabled=false;sync();}
async function task(label,fn){if(state.textEdit&&label!=='Текст')await finishTextEdit();if(state.busy||state.gesture)return;setBusy(label);try{return await fn();}catch(e){status(e.message);if(!/отмен/i.test(e.message||''))await message(e.message);}finally{state.busy=false;state.job=null;$('busy').hidden=true;$('cancel').hidden=true;$('progress').removeAttribute('value');sync();render();}}
async function snapshot(label){
 const layers=[];
 for(const l of state.layers){if(l.modified||!l.blob){l.blob=await blob(l.canvas);l.modified=false;}if(!l.baseBlob)l.baseBlob=l.blob;const {canvas:c,baseCanvas,modified,...saved}=l;layers.push({...saved});}
 if(state.selection&&!state.selectionBlob)state.selectionBlob=await blob(state.selection);
 return {label,layers,active:state.active,selection:state.selectionBlob,selectionBounds:state.selectionBounds,w:state.w,h:state.h,name:state.name};
}
async function commit(label){const saved=await snapshot(label);state.history.splice(state.index+1);state.history.push(saved);state.index=state.history.length-1;while(state.history.length>MAX_HISTORY||historySize()>256*1024*1024&&state.history.length>2){state.history.shift();state.index--;}setDirty(true);renderLayers();sync();render();status(label+' · изменения не сохранены');}
function historySize(){const blobs=new Set();for(const s of state.history){for(const l of s.layers){blobs.add(l.blob);blobs.add(l.baseBlob);}if(s.selection)blobs.add(s.selection);}return [...blobs].reduce((n,b)=>n+(b?.size||0),0);}
async function restore(s){const next=[];for(const l of s.layers){next.push({...l,canvas:await fromBlob(l.blob),modified:false});}state.layers=next;state.active=s.active;state.selection=s.selection?await fromBlob(s.selection):null;state.selectionBlob=s.selection;state.selectionBounds=s.selectionBounds||null;state.selectionObject=false;state.crop=null;state.w=s.w;state.h=s.h;state.name=s.name;renderLayers();render();}
async function mutate(label,fn){const before=state.history[state.index];try{await fn();await commit(label);}catch(e){if(before)await restore(before);throw e;}}
function action(label,fn){return task(label,()=>mutate(label,fn));}
async function historyStep(delta){return task(delta<0?'Отмена':'Повтор',async()=>{const n=state.index+delta;if(n<0||n>=state.history.length)return;const before={w:state.w,h:state.h};await restore(state.history[n]);state.index=n;state.crop=null;if(before.w!==state.w||before.h!==state.h)fit();setDirty(true);sync();status(state.history[n].label);});}
function hexToRgb(hex){const h=hex.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)||0);}

function baseCursor(){return state.tool==='hand'?'grab':state.tool==='move'?'move':state.tool==='text'?'text':'crosshair';}
function setTool(id){
 if(state.busy||state.gesture)return;
 if(state.textEdit)finishTextEdit();
 state.tool=id;const t=tools.find(t=>t[0]===id);$('tool-title').textContent=t[1];
 if(id!=='crop')state.crop=null;
 if(id==='crop'&&state.w&&!state.crop)state.crop={x:0,y:0,w:state.w,h:state.h};
 viewport.style.cursor=baseCursor();
 document.querySelectorAll('[data-tool]').forEach(b=>{const on=b.dataset.tool===id;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 toolOptions();sync();render();viewport.focus({preventScroll:true});
}
function toolOptions(){
 const t=state.tool,show=(id,vis)=>{$(id).hidden=!vis;};
 show('field-color',['brush','fill','text','select'].includes(t));
 show('field-size',t==='brush');
 show('field-softness',t==='brush');
 show('field-bgcolor',t==='eraser');
 show('field-tolerance',t==='fill'||(t==='background'&&state.bgMode==='color'));
 show('field-text',t==='text');
 show('field-select',t==='select');
 show('field-crop',t==='crop');
 show('field-background',t==='background');
 if(t==='select'){$('select-rect-mode').classList.toggle('active',state.selectMode==='rect');$('select-lasso-mode').classList.toggle('active',state.selectMode==='lasso');}
 if(t==='background'){$('bg-ai-mode').classList.toggle('active',state.bgMode==='ai');$('bg-color-mode').classList.toggle('active',state.bgMode==='color');}
 if(t==='text')syncTextControls();
}
function sync(){
 const has=!!state.w,locked=state.busy||!!state.gesture;
 for(const el of document.querySelectorAll('#tools button,.panel input,.panel textarea,.panel button'))el.disabled=!has||locked;
 $('undo').disabled=locked||state.index<=0;$('redo').disabled=locked||state.index>=state.history.length-1;
 $('export').disabled=!has||locked;$('project-save').disabled=!has||locked;
 $('open').disabled=locked;$('welcome-open').disabled=locked;
 $('crop-apply').disabled=!has||locked||!state.crop;
 $('erase-selection').disabled=!has||locked||!state.selection;
 $('cutout').disabled=!has||locked;
 const hasSel=!!state.selection;
 for(const id of ['selection-fill','selection-copy','selection-cut','selection-delete','selection-cutout'])$(id).disabled=!has||locked||!hasSel;
 $('select-invert').disabled=!has||locked;
 const l=activeOrNull();
 $('opacity').disabled=!has||locked||!l;
 if(l&&document.activeElement!==$('opacity'))$('opacity').value=Math.round(l.opacity*100);
 $('opacity-value').textContent=(l?Math.round(l.opacity*100):100)+'%';
 $('dimensions').textContent=has?`${state.w} × ${state.h} px · ${Math.round(state.scale*100)}%`:'';
 toolOptions();
}
function fit(){if(!state.w)return;state.scale=Math.min((viewport.clientWidth-64)/state.w,(viewport.clientHeight-96)/state.h,1);state.scale=Math.max(.005,state.scale);state.x=(viewport.clientWidth-state.w*state.scale)/2;state.y=(viewport.clientHeight-state.h*state.scale)/2;render();sync();}
function zoom(factor,p={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){const n=Math.max(.005,Math.min(32,state.scale*factor)),x=(p.x-state.x)/state.scale,y=(p.y-state.y)/state.scale;state.x=p.x-x*n;state.y=p.y-y*n;state.scale=n;render();sync();}

let frame=0;
function render(){if(!frame)frame=requestAnimationFrame(paint);}
let checker=null;
function checkerPattern(){if(checker)return checker;const tile=canvas(16,16),tc=tile.getContext('2d');tc.fillStyle='#fff';tc.fillRect(0,0,16,16);tc.fillStyle='#e1e4e8';tc.fillRect(0,0,8,8);tc.fillRect(8,8,8,8);checker=ctx.createPattern(tile,'repeat');return checker;}
function accent(){return getComputedStyle(document.body).getPropertyValue('--accent').trim()||'#3676e8';}
function paint(){
 frame=0;const dpr=Math.max(1,devicePixelRatio||1),vw=viewport.clientWidth,vh=viewport.clientHeight;
 for(const c of [screen,overlay])if(c.width!==Math.round(vw*dpr)||c.height!==Math.round(vh*dpr)){c.width=Math.round(vw*dpr);c.height=Math.round(vh*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,vw,vh);ox.setTransform(dpr,0,0,dpr,0,0);ox.clearRect(0,0,vw,vh);
 if(!state.w)return;
 const x=state.x,y=state.y,s=state.scale,W=state.w*s,H=state.h*s;
 ctx.fillStyle=checkerPattern();ctx.fillRect(x,y,W,H);
 ctx.save();ctx.beginPath();ctx.rect(x,y,W,H);ctx.clip();ctx.translate(x,y);ctx.scale(s,s);
 for(const l of state.layers)if(l.visible){ctx.globalAlpha=l.opacity;ctx.drawImage(l.canvas,l.x,l.y);}
 ctx.restore();
 ctx.strokeStyle='rgba(20,24,32,.22)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,W-1,H-1);
 if(state.selection){
  ox.save();ox.translate(x,y);ox.scale(s,s);
  ox.globalAlpha=.44;ox.drawImage(state.selection,0,0);
  ox.globalCompositeOperation='source-in';ox.fillStyle=accent();ox.fillRect(0,0,state.w,state.h);
  ox.globalCompositeOperation='destination-over';ox.globalAlpha=1;ox.fillStyle='rgba(10,14,22,.30)';ox.fillRect(0,0,state.w,state.h);
  ox.restore();
 }
 const g=state.gesture;
 if(g&&(g.type==='selection'||g.type==='bgselect')&&g.points?.length){ox.save();ox.translate(x,y);ox.scale(s,s);ox.strokeStyle=accent();ox.lineWidth=1.5/s;ox.setLineDash([5/s,4/s]);drawPath(ox,g.tool,g.start,g.end,g.points);ox.stroke();ox.restore();}
 if(g&&g.type==='move'){const l=g.layer;ox.save();ox.translate(x,y);ox.scale(s,s);ox.strokeStyle=accent();ox.lineWidth=1/s;ox.setLineDash([4/s,3/s]);ox.strokeRect(l.x,l.y,l.canvas.width,l.canvas.height);ox.restore();}
 drawCrop(x,y,s);
}
function drawCrop(x,y,s){
 if(state.tool!=='crop')return;
 const c=state.crop;if(!c)return;
 const cx=x+c.x*s,cy=y+c.y*s,cw=Math.max(1,c.w*s),ch=Math.max(1,c.h*s);
 ox.save();
 ox.fillStyle='rgba(12,16,24,.42)';ox.beginPath();ox.rect(x,y,state.w*s,state.h*s);ox.rect(cx,cy,cw,ch);ox.fill('evenodd');
 ox.strokeStyle='rgba(255,255,255,.85)';ox.lineWidth=1;ox.strokeRect(cx+.5,cy+.5,cw,ch);
 ox.strokeStyle=accent();ox.lineWidth=1.5;ox.setLineDash([6,4]);ox.strokeRect(cx,cy,cw,ch);ox.setLineDash([]);
 ox.strokeStyle='rgba(255,255,255,.35)';
 for(let i=1;i<3;i++){ox.beginPath();ox.moveTo(cx+cw*i/3,cy);ox.lineTo(cx+cw*i/3,cy+ch);ox.moveTo(cx,cy+ch*i/3);ox.lineTo(cx+cw,cy+ch*i/3);ox.stroke();}
 const hs=7,points=[[cx,cy],[cx+cw/2,cy],[cx+cw,cy],[cx+cw,cy+ch/2],[cx+cw,cy+ch],[cx+cw/2,cy+ch],[cx,cy+ch],[cx,cy+ch/2]];
 ox.fillStyle='#fff';ox.strokeStyle=accent();ox.lineWidth=1.5;
 for(const [hx,hy] of points){ox.fillRect(hx-hs/2,hy-hs/2,hs,hs);ox.strokeRect(hx-hs/2,hy-hs/2,hs,hs);}
 ox.restore();
}
function point(e){const r=viewport.getBoundingClientRect();return{x:(e.clientX-r.left-state.x)/state.scale,y:(e.clientY-r.top-state.y)/state.scale};}
function bounds(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.max(0,Math.abs(a.x-b.x)),h:Math.max(0,Math.abs(a.y-b.y))};}
function pathBounds(points){
 let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
 for(const p of points){x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}
 if(!Number.isFinite(x1))return null;
 const x=clamp(Math.floor(x1),0,state.w-1),y=clamp(Math.floor(y1),0,state.h-1),right=clamp(Math.ceil(x2),x+1,state.w),bottom=clamp(Math.ceil(y2),y+1,state.h);
 return{x,y,w:right-x,h:bottom-y};
}
function drawPath(c,tool,a,b,points){c.beginPath();if(tool==='lasso'){if(!points.length)return;c.moveTo(points[0].x,points[0].y);for(const p of points)c.lineTo(p.x,p.y);c.closePath();}else{const r=bounds(a,b);c.rect(r.x,r.y,r.w,r.h);}}
function applySelection(c,x=0,y=0){if(!state.selection)return;const cctx=c.getContext('2d');cctx.save();cctx.globalCompositeOperation='destination-in';cctx.drawImage(state.selection,-x,-y);cctx.restore();}
function setSelection(c,bounds=null,object=false){state.selection=c;state.selectionBlob=null;state.selectionBounds=c?bounds:null;state.selectionObject=!!(c&&object);}
function fullLayer(l){const c=canvas(state.w,state.h);c.getContext('2d').drawImage(l.canvas,l.x,l.y);return c;}
function flatten(){const c=canvas(state.w,state.h),cx=c.getContext('2d');for(const l of state.layers)if(l.visible){cx.globalAlpha=l.opacity;cx.drawImage(l.canvas,l.x,l.y);}return c;}

function stamp(l,p,tool){
 const size=Math.max(1,+$('size').value),r=size/2,left=Math.floor(p.x-r-2),top=Math.floor(p.y-r-2),side=Math.ceil(size+4);
 const patch=canvas(side,side),pc=patch.getContext('2d');
 if(tool==='erase'){pc.fillStyle='#000';}
 else if(tool==='eraser'){pc.fillStyle=$('bgcolor').value;}
 else{const soft=+$('softness').value/100;if(soft>0){const gradient=pc.createRadialGradient(p.x-left,p.y-top,r*(1-soft),p.x-left,p.y-top,r);gradient.addColorStop(0,$('color').value);gradient.addColorStop(1,'rgba(0,0,0,0)');pc.fillStyle=gradient;}else pc.fillStyle=$('color').value;}
 pc.beginPath();pc.arc(p.x-left,p.y-top,r,0,Math.PI*2);pc.fill();
 applySelection(patch,left,top);
 const target=l.canvas.getContext('2d');target.save();target.globalCompositeOperation=tool==='erase'?'destination-out':'source-over';target.drawImage(patch,left-l.x,top-l.y);target.restore();
 l.modified=true;l.kind='raster';
}
function stroke(l,a,b,tool){const distance=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(distance/Math.max(1,+$('size').value/5)));for(let i=1;i<=steps;i++)stamp(l,{x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps},tool);}

function cropHit(p){
 const c=state.crop;if(!c)return null;
 const t=9/state.scale;
 if(p.x<c.x-t||p.x>c.x+c.w+t||p.y<c.y-t||p.y>c.y+c.h+t)return null;
 let h='';
 if(Math.abs(p.x-c.x)<=t)h+='w';
 if(Math.abs(p.x-(c.x+c.w))<=t)h+='e';
 if(Math.abs(p.y-c.y)<=t)h+='n';
 if(Math.abs(p.y-(c.y+c.h))<=t)h+='s';
 if(h)return{mode:'resize',handle:h};
 if(p.x>c.x&&p.x<c.x+c.w&&p.y>c.y&&p.y<c.y+c.h)return{mode:'move'};
 return null;
}
function cropCursor(hit){
 if(!hit)return 'crosshair';
 if(hit.mode==='move')return 'move';
 const h=hit.handle,ns=h.includes('n')||h.includes('s'),ew=h.includes('e')||h.includes('w');
 if(ns&&ew)return (h.includes('n')&&h.includes('w'))||(h.includes('s')&&h.includes('e'))?'nwse-resize':'nesw-resize';
 if(ns)return 'ns-resize';
 return 'ew-resize';
}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function clampRect(r){const x=clamp(r.x,0,state.w),y=clamp(r.y,0,state.h);return{x,y,w:clamp(r.w,0,state.w-x),h:clamp(r.h,0,state.h-y)};}
function resizeCrop(rect,handle,p){
 let x1=rect.x,y1=rect.y,x2=rect.x+rect.w,y2=rect.y+rect.h;
 if(handle.includes('w'))x1=clamp(p.x,0,x2-1);
 if(handle.includes('e'))x2=clamp(p.x,x1+1,state.w);
 if(handle.includes('n'))y1=clamp(p.y,0,y2-1);
 if(handle.includes('s'))y2=clamp(p.y,y1+1,state.h);
 return clampRect({x:x1,y:y1,w:x2-x1,h:y2-y1});
}
async function applyCrop(){
 if(!state.crop)return;
 const c={x:Math.round(state.crop.x),y:Math.round(state.crop.y),w:Math.round(state.crop.w),h:Math.round(state.crop.h)};
 if(c.w<1||c.h<1)return;
 await action('Кадрирование',()=>{
  state.w=c.w;state.h=c.h;
  for(const l of state.layers){l.x-=c.x;l.y-=c.y;}
  state.crop=null;setSelection(null);
 });
 fit();
}

viewport.addEventListener('pointerdown',async e=>{
 if(!state.w||state.busy||state.gesture)return;
 if(e.target!==screen)return;
 if(e.button===2)return;
 if(state.textEdit){await finishTextEdit();if(state.busy||state.gesture)return;}
 const p=point(e);
 if(e.button===1||state.space||state.tool==='hand'){state.gesture={type:'pan',cx:e.clientX,cy:e.clientY,x:state.x,y:state.y};viewport.setPointerCapture(e.pointerId);viewport.style.cursor='grabbing';e.preventDefault();sync();return;}
 if(e.button!==0)return;viewport.focus({preventScroll:true});
 try{
  if(state.tool==='crop'){
   if(!state.crop)state.crop={x:0,y:0,w:state.w,h:state.h};
   const hit=cropHit(p);
   if(hit)state.gesture={type:'crop',mode:hit.mode,handle:hit.handle,start:p,rect:{...state.crop}};
   else{state.crop=null;state.gesture={type:'crop',mode:'new',start:p};}
   viewport.setPointerCapture(e.pointerId);sync();render();e.preventDefault();return;
  }
  if(state.tool==='background'){
   state.gesture={type:'bgselect',tool:'lasso',start:p,end:p,points:[p],moved:false};
   viewport.setPointerCapture(e.pointerId);e.preventDefault();sync();render();return;
  }
  if(state.tool==='select'){
   state.gesture={type:'selection',tool:state.selectMode==='lasso'?'lasso':'select-rect',start:p,end:p,points:[p]};
   viewport.setPointerCapture(e.pointerId);e.preventDefault();sync();render();return;
  }
  if(state.tool==='fill'){await action('Заливка',()=>fillAt(p));return;}
  if(state.tool==='text'){const hit=findTextLayerAt(p);if(hit){if(hit.locked||!hit.visible)throw Error('Слой текста заблокирован или скрыт.');startTextEdit(hit,false);}else newTextLayer(p);return;}
  if(state.tool==='move'){
   const l=editable();
   state.gesture={type:'move',layer:l,start:p,lx:l.x,ly:l.y};
   viewport.setPointerCapture(e.pointerId);sync();render();e.preventDefault();return;
  }
  if(['brush','eraser','erase'].includes(state.tool)){
   const l=editable();
   state.gesture={type:'stroke',tool:state.tool,last:p,layer:l};
   stamp(l,p,state.tool);viewport.setPointerCapture(e.pointerId);sync();render();e.preventDefault();return;
  }
 }catch(error){await message(error.message);}
});
viewport.addEventListener('pointermove',e=>{
 const g=state.gesture;
 if(!g){
  if(state.tool==='crop'&&state.crop&&e.target===screen){viewport.style.cursor=cropCursor(cropHit(point(e)));}
  return;
 }
 if(g.type==='pan'){state.x=g.x+e.clientX-g.cx;state.y=g.y+e.clientY-g.cy;render();return;}
 const p=point(e);
 if(g.type==='crop'){
  if(g.mode==='new')state.crop=clampRect({x:Math.min(g.start.x,p.x),y:Math.min(g.start.y,p.y),w:Math.abs(p.x-g.start.x),h:Math.abs(p.y-g.start.y)});
  else if(g.mode==='move'){const dx=p.x-g.start.x,dy=p.y-g.start.y;state.crop={x:clamp(g.rect.x+dx,0,state.w-g.rect.w),y:clamp(g.rect.y+dy,0,state.h-g.rect.h),w:g.rect.w,h:g.rect.h};}
  else state.crop=resizeCrop(g.rect,g.handle,p);
  render();return;
 }
 if(g.type==='move'){g.layer.x=Math.round(g.lx+p.x-g.start.x);g.layer.y=Math.round(g.ly+p.y-g.start.y);render();return;}
 if(g.type==='stroke'){stroke(g.layer,g.last,p,g.tool);g.last=p;render();return;}
 if(e.shiftKey&&g.tool==='select-rect'){const n=Math.max(Math.abs(p.x-g.start.x),Math.abs(p.y-g.start.y));p={x:g.start.x+Math.sign(p.x-g.start.x||1)*n,y:g.start.y+Math.sign(p.y-g.start.y||1)*n};}
 if(g.type==='selection'||g.type==='bgselect'){if(g.tool==='lasso')g.points.push(p);else g.end=p;}
 if(g.type==='bgselect'&&!g.moved&&Math.hypot(p.x-g.start.x,p.y-g.start.y)>4)g.moved=true;
 g.end=p;render();
});
viewport.addEventListener('pointerleave',()=>{if(!state.gesture)viewport.style.cursor=baseCursor();});
viewport.addEventListener('pointerup',e=>{
 const g=state.gesture;if(!g)return;state.gesture=null;if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
 viewport.style.cursor=baseCursor();
 if(g.type==='pan'){sync();return;}
 if(g.type==='crop'){if(state.crop&&(state.crop.w<2||state.crop.h<2))state.crop=null;sync();render();return;}
 if(g.type==='stroke'){task('Рисование',()=>mutate('Рисование',async()=>{}));return;}
 if(g.type==='move'){task('Перемещение слоя',()=>mutate('Перемещение слоя',async()=>{}));return;}
 if(g.type==='selection'){
  task('Выделение',()=>mutate('Выделение',async()=>{
   const c=canvas(state.w,state.h),cctx=c.getContext('2d');cctx.fillStyle='#fff';drawPath(cctx,g.tool,g.start,g.end,g.points);cctx.fill();setSelection(c,pathBounds(g.tool==='lasso'?g.points:[g.start,g.end]));
  }));
  return;
 }
 if(g.type==='bgselect'){
  if(!g.moved){
   if(state.bgMode==='ai'){task('AI: выделение объекта',()=>mutate('AI: выделение объекта',()=>aiObjectSelection(g.start)));return;}
   task('Выделение по цвету',()=>mutate('Выделение по цвету',()=>wandAt(g.start)));return;
  }
  task('Выделение лассо',()=>mutate('Выделение лассо',async()=>{
   const c=canvas(state.w,state.h),cctx=c.getContext('2d');cctx.fillStyle='#fff';drawPath(cctx,'lasso',g.start,g.end,g.points);cctx.fill();setSelection(c,pathBounds(g.points));
  }));
 }
});
viewport.addEventListener('pointercancel',()=>{if(!state.gesture)return;const g=state.gesture;state.gesture=null;if(g.type!=='pan'&&g.type!=='crop')task('Отмена незавершённого действия',()=>restore(state.history[state.index]));else{sync();render();}});
viewport.addEventListener('wheel',e=>{if(!state.w)return;e.preventDefault();if(state.textEdit)finishTextEdit();const r=viewport.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
viewport.addEventListener('dragover',e=>e.preventDefault());
viewport.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)task('Открываю изображение',()=>openFile(f));});
new ResizeObserver(()=>{render();sync();}).observe(viewport);

function renderLayers(){
 const cont=$('layers');cont.replaceChildren();
 for(const l of [...state.layers].reverse()){
  const row=document.createElement('div');row.className='layer'+(l.id===state.active?' selected':'')+(!l.visible?' off':'');row.dataset.layer=l.id;row.setAttribute('role','listitem');
  const thumb=canvas(32,32),t=thumb.getContext('2d'),sc=Math.min(30/l.canvas.width,30/l.canvas.height);t.drawImage(l.canvas,(32-l.canvas.width*sc)/2,(32-l.canvas.height*sc)/2,l.canvas.width*sc,l.canvas.height*sc);
  row.innerHTML=`<img class="thumb" alt=""><input class="layer-name" value="${esc(l.name)}" aria-label="Имя слоя" spellcheck="false"><div class="layer-actions"><button data-act="visible" title="${l.visible?'Скрыть слой':'Показать слой'}" aria-label="Видимость">${l.visible?ICON.eye:ICON.eyeOff}</button><button data-act="lock" title="${l.locked?'Разблокировать':'Заблокировать'}" aria-label="Блокировка">${l.locked?ICON.lock:ICON.unlock}</button><button data-act="up" title="Выше" aria-label="Выше">${ICON.up}</button><button data-act="down" title="Ниже" aria-label="Ниже">${ICON.down}</button><button data-act="copy" title="Дублировать (Ctrl+J)" aria-label="Дублировать">${ICON.copy}</button><button data-act="delete" title="Удалить слой" aria-label="Удалить слой" class="danger">${ICON.trash}</button></div>`;
  row.querySelector('.thumb').src=thumb.toDataURL();
  row.onclick=e=>{if(state.busy||state.gesture||e.target.closest('button,input'))return;state.active=l.id;renderLayers();sync();render();};
  row.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();if(state.busy||state.gesture)return;state.active=l.id;renderLayers();sync();render();const items=[];if(l.kind==='text')items.push({label:'Изменить текст',action:()=>{setTool('text');startTextEdit(l,false);}},{sep:true});items.push({label:'Дублировать слой',action:()=>duplicateLayer(l)},{label:'Выше',action:()=>moveLayer(l,1)},{label:'Ниже',action:()=>moveLayer(l,-1)},{sep:true},{label:'Удалить слой',danger:true,action:()=>deleteLayer(l)});showMenu(e.clientX,e.clientY,items);};
  row.querySelector('.layer-name').onchange=e=>{const name=e.target.value.slice(0,80)||'Слой';action('Переименование слоя',()=>{l.name=name;});};
  row.querySelector('[data-act=visible]').onclick=()=>action('Видимость слоя',()=>{l.visible=!l.visible;});
  row.querySelector('[data-act=lock]').onclick=()=>action('Блокировка слоя',()=>{l.locked=!l.locked;});
  row.querySelector('[data-act=up]').onclick=()=>moveLayer(l,1);
  row.querySelector('[data-act=down]').onclick=()=>moveLayer(l,-1);
  row.querySelector('[data-act=copy]').onclick=()=>duplicateLayer(l);
  row.querySelector('[data-act=delete]').onclick=()=>deleteLayer(l);
  cont.append(row);
 }
 sync();
}
function moveLayer(l,delta){action('Порядок слоёв',()=>{const i=state.layers.indexOf(l),n=clamp(i+delta,0,state.layers.length-1);state.layers.splice(i,1);state.layers.splice(n,0,l);});}
function duplicateLayer(l){action('Дубликат слоя',()=>{const c=canvas(l.canvas.width,l.canvas.height);c.getContext('2d').drawImage(l.canvas,0,0);addLayer(makeLayer(c,l.name+' — копия',l.kind,{x:l.x,y:l.y,opacity:l.opacity,text:l.text,font:l.font,fontSize:l.fontSize,bold:l.bold,color:l.color}),state.layers.indexOf(l)+1);});}
function deleteLayer(l){action('Удаление слоя',()=>{if(state.layers.length<2)throw Error('Нельзя удалить единственный слой.');const i=state.layers.indexOf(l);state.layers.splice(i,1);state.active=state.layers[Math.max(0,i-1)]?.id;});}

function fontStack(font){const f=String(font||'Segoe UI').replace(/["\\]/g,'');return `"${f}", sans-serif`;}
function textCanvas(text,size,bold,color,font='Segoe UI'){const lines=String(text??'').split('\n').slice(0,200),measure=canvas(1,1).getContext('2d');measure.font=`${bold?'600':'400'} ${size}px ${fontStack(font)}`;const w=Math.ceil(Math.max(1,...lines.map(s=>measure.measureText(s).width))+12),h=Math.ceil(lines.length*size*1.3+12);checkSize(w,h);const c=canvas(w,h),cctx=c.getContext('2d');cctx.font=measure.font;cctx.fillStyle=color;cctx.textBaseline='top';lines.forEach((s,i)=>cctx.fillText(s,6,6+i*size*1.3));return c;}
function findTextLayerAt(p){for(let i=state.layers.length-1;i>=0;i--){const l=state.layers[i];if(!l.visible||l.kind!=='text')continue;if(p.x>=l.x&&p.x<=l.x+l.canvas.width&&p.y>=l.y&&p.y<=l.y+l.canvas.height)return l;}return null;}
function newTextLayer(p){
 const font=FONTS.includes($('font').value)?$('font').value:'Segoe UI',size=clamp(Math.round(+$('font-size').value)||64,8,400),bold=$('bold').checked,color=$('color').value;
 const c=textCanvas('',size,bold,color,font);
 const l=makeLayer(c,'Текст','text',{x:clamp(Math.round(p.x),0,state.w-1),y:clamp(Math.round(p.y),0,state.h-1),text:'',font,fontSize:size,bold,color});
 addLayer(l);startTextEdit(l,true);
}
function startTextEdit(l,isNew){
 l.text=String(l.text??'');state.textEdit={layer:l,isNew,dirty:!!isNew};state.active=l.id;
 textEditor.hidden=false;textEditor.value=l.text;layoutTextEditor();
 renderLayers();sync();render();
 queueMicrotask(()=>{if(!state.textEdit||state.textEdit.layer!==l)return;textEditor.focus({preventScroll:true});textEditor.setSelectionRange(textEditor.value.length,textEditor.value.length);updateTextCaret();});
}
function layoutTextEditor(){
 const e=state.textEdit;if(!e)return;const l=e.layer,s=state.scale,pad=6*s;
 textEditor.style.left=(state.x+l.x*s+pad)+'px';textEditor.style.top=(state.y+l.y*s+pad)+'px';
 textEditor.style.fontFamily=fontStack(l.font);textEditor.style.fontSize=(l.fontSize*s)+'px';textEditor.style.lineHeight='1.3';textEditor.style.fontWeight=l.bold?'600':'400';
 textEditor.style.width=Math.max(48,(l.canvas.width-12)*s+10)+'px';textEditor.style.height=Math.max(24,(l.canvas.height-12)*s+6)+'px';
 updateTextCaret();
}
function updateTextCaret(){
 const e=state.textEdit;
 if(!e||textEditor.hidden){textCaret.hidden=true;return;}
 const empty=!textEditor.value,focused=document.activeElement===textEditor;
 textEditor.style.caretColor=empty?'transparent':'var(--accent)';
 if(!empty||!focused){textCaret.hidden=true;return;}
 const l=e.layer,s=state.scale;
 textCaret.hidden=false;
 textCaret.style.left=(state.x+(l.x+6)*s)+'px';
 textCaret.style.top=(state.y+(l.y+6)*s)+'px';
 textCaret.style.height=Math.max(4,l.fontSize*1.3*s)+'px';
}
function updateTextLayer(l){
 const c=textCanvas(l.text,l.fontSize,l.bold,l.color,l.font);
 const others=state.layers.reduce((sum,x)=>sum+(x===l?0:x.canvas.width*x.canvas.height),0);
 if(others+c.width*c.height>MAX_LAYER_PIXELS)throw Error('Достигнут лимит памяти слоёв.');
 l.canvas=c;l.modified=true;l.kind='text';
 const first=String(l.text).split('\n').find(s=>s.trim());
 l.name=(first||'Текст').trim().slice(0,28)||'Текст';
 if(state.textEdit?.layer===l)layoutTextEditor();
 render();
}
async function finishTextEdit(){
 const e=state.textEdit;if(!e)return;
 state.textEdit=null;textEditor.hidden=true;textCaret.hidden=true;
 const l=e.layer;
 if(e.isNew&&!l.text.trim()){
  const i=state.layers.indexOf(l);if(i>=0)state.layers.splice(i,1);
  if(state.active===l.id)state.active=state.layers[state.layers.length-1]?.id??null;
  renderLayers();sync();render();return;
 }
 const first=l.text.split('\n').find(s=>s.trim());l.name=(first||'Текст').trim().slice(0,28)||'Текст';
 renderLayers();sync();render();
 if(e.isNew||e.dirty)await action('Текст',async()=>{});
}
function syncTextControls(){
 const l=state.textEdit?.layer||activeOrNull();if(!l||l.kind!=='text')return;
 if(document.activeElement!==$('font'))$('font').value=FONTS.includes(l.font)?l.font:'Segoe UI';
 if(document.activeElement!==$('font-size'))$('font-size').value=l.fontSize||64;
 $('bold').checked=!!l.bold;
 if(document.activeElement!==$('color'))$('color').value=l.color||'#24262b';
}
function applyTextOption(){
 if(!state.w)return;const l=state.textEdit?.layer||activeOrNull();if(!l||l.kind!=='text')return;
 const before=l.text;l.font=FONTS.includes($('font').value)?$('font').value:'Segoe UI';l.fontSize=clamp(Math.round(+$('font-size').value)||64,8,400);l.bold=$('bold').checked;l.color=$('color').value;
 try{updateTextLayer(l);if(state.textEdit)state.textEdit.dirty=true;}catch(e){l.text=before;textEditor.value=before;status(e.message);}
}
function commitTextOption(){if(state.textEdit)return;const l=activeOrNull();if(l&&l.kind==='text')action('Текст',async()=>{});}
textEditor.addEventListener('focus',updateTextCaret);
textEditor.addEventListener('blur',()=>setTimeout(updateTextCaret,0));
textEditor.addEventListener('input',()=>{
 const e=state.textEdit;if(!e)return;const l=e.layer,before=l.text;
 l.text=textEditor.value.slice(0,5000);
 try{updateTextLayer(l);e.dirty=true;layoutTextEditor();updateTextCaret();}catch(error){l.text=before;textEditor.value=before;status(error.message);}
});
textEditor.addEventListener('blur',e=>{
 const target=e.relatedTarget;
 if(target&&target.closest&&target.closest('#field-text,#field-color'))return;
 setTimeout(()=>{if(state.textEdit&&document.activeElement!==textEditor&&!document.activeElement?.closest?.('#field-text,#field-color'))finishTextEdit();},0);
});
textEditor.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();e.stopPropagation();finishTextEdit();}});

function pixelWorker(){
 self.onmessage=e=>{
  const d=e.data;
  if(d.kind==='wand'){
   const {pixels,w,h,x,y,tolerance}=d,mask=new Uint8ClampedArray(w*h*4),visited=new Uint8Array(w*h),queue=new Int32Array(w*h);
   let head=0,tail=0,minX=w,minY=h,maxX=-1,maxY=-1;const start=Math.min(w*h-1,Math.max(0,y*w+x)),offset=start*4,base=[pixels[offset],pixels[offset+1],pixels[offset+2],pixels[offset+3]],limit=tolerance*tolerance*4;
   queue[tail++]=start;visited[start]=1;
   while(head<tail){const n=queue[head++],i=n*4;let distance=0;for(let k=0;k<4;k++)distance+=(pixels[i+k]-base[k])**2;if(distance>limit)continue;mask[i]=mask[i+1]=mask[i+2]=mask[i+3]=255;const col=n%w,row=(n/w)|0;if(col<minX)minX=col;if(col>maxX)maxX=col;if(row<minY)minY=row;if(row>maxY)maxY=row;for(const v of [col?n-1:-1,col<w-1?n+1:-1,n-w,n+w])if(v>=0&&v<w*h&&!visited[v]){visited[v]=1;queue[tail++]=v;}}
   self.postMessage({mask:mask.buffer,bounds:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}},[mask.buffer]);return;
  }
  if(d.kind==='fill'){
   const {pixels,w,h,x,y,tolerance,color,mask}=d,visited=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
   const start=Math.min(w*h-1,Math.max(0,y*w+x));if(mask&&!mask[start]){self.postMessage(pixels.buffer,[pixels.buffer]);return;}
   const o=start*4,base=[pixels[o],pixels[o+1],pixels[o+2],pixels[o+3]],limit=tolerance*tolerance*4;
   queue[tail++]=start;visited[start]=1;
   while(head<tail){const n=queue[head++],i=n*4;let distance=0;for(let k=0;k<4;k++)distance+=(pixels[i+k]-base[k])**2;if(distance>limit)continue;pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=color[3];const col=n%w;for(const v of [col?n-1:-1,col<w-1?n+1:-1,n-w,n+w])if(v>=0&&v<w*h&&!visited[v]&&(!mask||mask[v])){visited[v]=1;queue[tail++]=v;}}
   self.postMessage(pixels.buffer,[pixels.buffer]);
  }
 };
}
function runPixel(kind,data,transfer=[]){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([`(${pixelWorker.toString()})();`],{type:'text/javascript'}));const worker=new Worker(url);worker.onmessage=e=>{worker.terminate();URL.revokeObjectURL(url);resolve(e.data);};worker.onerror=e=>{worker.terminate();URL.revokeObjectURL(url);reject(Error(e.message||'Ошибка обработки пикселей.'));};worker.postMessage({kind,...data},transfer);});}

async function wandAt(p){
 if(!state.layers.some(l=>l.visible))throw Error('Нет видимых слоёв.');
 const flat=flatten(),data=flat.getContext('2d').getImageData(0,0,state.w,state.h);
 const x=clamp(Math.floor(p.x),0,state.w-1),y=clamp(Math.floor(p.y),0,state.h-1);
 const mask=await runPixel('wand',{pixels:data.data,w:state.w,h:state.h,x,y,tolerance:+$('tolerance').value},[data.data.buffer]);
 const c=canvas(state.w,state.h);c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(mask.mask),state.w,state.h),0,0);setSelection(c,mask.bounds);
}
async function fillAt(p){
 const l=editable(),lx=Math.floor(p.x-l.x),ly=Math.floor(p.y-l.y);
 if(lx<0||ly<0||lx>=l.canvas.width||ly>=l.canvas.height)throw Error('Щёлкните внутри активного слоя.');
 const w=l.canvas.width,h=l.canvas.height,data=l.canvas.getContext('2d').getImageData(0,0,w,h);
 let mask=null;
 if(state.selection){const tmp=canvas(w,h),tc=tmp.getContext('2d');tc.drawImage(state.selection,-l.x,-l.y);const d=tc.getImageData(0,0,w,h).data;mask=new Uint8Array(w*h);for(let i=0;i<mask.length;i++)mask[i]=d[i*4+3];if(!mask[ly*w+lx])throw Error('Точка находится вне выделения.');}
 const rgb=hexToRgb($('color').value);
 const out=await runPixel('fill',{pixels:data.data,w,h,x:lx,y:ly,tolerance:+$('tolerance').value,color:[...rgb,255],mask},mask?[data.data.buffer,mask.buffer]:[data.data.buffer]);
 l.canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(out),w,h),0,0);
 l.modified=true;l.kind='raster';
}

const rpc=(method,params)=>thodHub.call('worker.'+method,params);
async function upload(b){const {id}=await rpc('upload.begin');try{for(let offset=0;offset<b.size;offset+=512*1024){const part=await dataUrl(b.slice(offset,offset+512*1024));await rpc('upload.write',{id,offset,base64:part.split(',')[1]});$('progress').value=offset/b.size*15;}await rpc('upload.finish',{id});return id;}catch(e){await rpc('upload.release',{id}).catch(()=>{});throw e;}}
async function runJob(kind,params){
 const {jobId}=await rpc('job.start',{kind,params});state.job=jobId;$('cancel').hidden=kind==='export.save';$('cancel').disabled=false;$('progress').value=0;
 while(true){const job=await rpc('job.status',{id:jobId});$('busy-label').textContent=job.message||'Обработка';if(typeof job.progress==='number')$('progress').value=job.progress;if(job.state==='done'){state.job=null;return job.result;}if(job.state==='error'||job.state==='canceled'){state.job=null;throw Error(job.error||'Операция отменена.');}await new Promise(r=>setTimeout(r,200));}
}
async function aiMask(l){
 $('busy-label').textContent='Подготовка изображения для IS-Net';
 const c=fullLayer(l),id=await upload(await blob(c));
 try{
  const result=await runJob('mask',{id});
  const small=await fromBlob(fromDataUrl(result.mask)),sctx=small.getContext('2d'),pixels=sctx.getImageData(0,0,small.width,small.height);
  for(let i=0;i<pixels.data.length;i+=4){pixels.data[i+3]=pixels.data[i];pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;}
  sctx.putImageData(pixels,0,0);
  const mask=canvas(state.w,state.h);mask.getContext('2d').drawImage(small,0,0,state.w,state.h);return {mask,small};
 }finally{await rpc('upload.release',{id}).catch(()=>{});}
}
function aiObjectSelection(p){
 return (async()=>{
  const l=editable();const {small}=await aiMask(l);
  const sw=small.width,sh=small.height,data=small.getContext('2d').getImageData(0,0,sw,sh).data;
  const sx=clamp(Math.floor(p.x/state.w*sw),0,sw-1),sy=clamp(Math.floor(p.y/state.h*sh),0,sh-1),radius=Math.max(8,Math.round(sw*.03));
  let start=-1;
  for(let r=0;r<=radius&&start<0;r++){
   for(let dy=-r;dy<=r&&start<0;dy++)for(let dx=-r;dx<=r;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
    const x=sx+dx,y=sy+dy;if(x<0||y<0||x>=sw||y>=sh)continue;
    if(data[(y*sw+x)*4+3]>=128){start=y*sw+x;break;}
   }
  }
  if(start<0)throw Error('На этом месте не найден объект. Щёлкните по объекту ещё раз.');
  const threshold=96,seen=new Uint8Array(sw*sh),queue=new Int32Array(sw*sh),image=new ImageData(sw,sh),out=image.data;
  let head=0,tail=0,minX=sw,minY=sh,maxX=-1,maxY=-1;queue[tail++]=start;seen[start]=1;
  while(head<tail){
   const n=queue[head++],a=data[n*4+3];if(a<threshold)continue;
   const x=n%sw,y=(n/sw)|0;out[n*4]=out[n*4+1]=out[n*4+2]=out[n*4+3]=255;
   if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
   for(const v of [x?n-1:-1,x<sw-1?n+1:-1,n-sw,n+sw])if(v>=0&&v<sw*sh&&!seen[v]){seen[v]=1;queue[tail++]=v;}
  }
  if(maxX<0)throw Error('Не удалось выделить объект. Попробуйте щёлкнуть по другому месту.');
  const comp=canvas(sw,sh);comp.getContext('2d').putImageData(image,0,0);
  const sel=canvas(state.w,state.h);sel.getContext('2d').drawImage(comp,0,0,state.w,state.h);
  setSelection(sel,{x:Math.floor(minX/sw*state.w),y:Math.floor(minY/sh*state.h),w:Math.ceil((maxX-minX+1)/sw*state.w),h:Math.ceil((maxY-minY+1)/sh*state.h)},true);
 })();
}
function maskHasPixels(c){const probe=canvas(64,64),pctx=probe.getContext('2d');pctx.drawImage(c,0,0,64,64);const d=pctx.getImageData(0,0,64,64).data;for(let i=3;i<d.length;i+=4)if(d[i])return true;return false;}
function invertSelection(){
 if(!state.selection){const c=canvas(state.w,state.h),cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,state.w,state.h);setSelection(c,{x:0,y:0,w:state.w,h:state.h});return;}
 const c=canvas(state.w,state.h),cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,state.w,state.h);cx.globalCompositeOperation='destination-out';cx.drawImage(state.selection,0,0);
 setSelection(maskHasPixels(c)?c:null,null);
}
function fillSelection(){
 const l=editable();if(!state.selection)throw Error('Сначала выделите область.');
 const patch=canvas(l.canvas.width,l.canvas.height),pc=patch.getContext('2d');pc.fillStyle=$('color').value;pc.fillRect(0,0,patch.width,patch.height);applySelection(patch,l.x,l.y);
 l.canvas.getContext('2d').drawImage(patch,0,0);l.modified=true;l.kind='raster';
}
function selectionToLayer(cut){
 const l=editable(),b=selectionBounds();if(!b)throw Error('Сначала выделите область.');
 const c=canvas(b.w,b.h),cx=c.getContext('2d');cx.drawImage(l.canvas,l.x-b.x,l.y-b.y);cx.globalCompositeOperation='destination-in';cx.drawImage(state.selection,-b.x,-b.y);
 const nl=makeLayer(c,cut?'Вырезано':'Выделение','raster',{x:b.x,y:b.y});addLayer(nl,state.layers.indexOf(l)+1);
 if(cut)eraseMask(l,state.selection);
 setSelection(null);
}
function deleteSelection(){if(!state.selection)throw Error('Сначала выделите область.');eraseMask(editable(),state.selection);setSelection(null);}
async function removeBackgroundAI(){
 await action('Удаление фона ИИ',async()=>{const l=editable(),{mask}=await aiMask(l);if(state.selectionObject&&state.selection){const b=selectionBounds();if(b)removeBackgroundAroundSelection(l,mask,b);else removeBackground(l,mask,true);}else removeBackground(l,mask,!!state.selection);setSelection(null);});
}
function eraseMask(l,mask){const c=l.canvas.getContext('2d');c.save();c.globalCompositeOperation='destination-out';c.drawImage(mask,-l.x,-l.y);c.restore();l.modified=true;l.kind='raster';}
function removeBackground(l,mask,respectSelection){
 if(respectSelection&&state.selection){const background=canvas(state.w,state.h),c=background.getContext('2d');c.fillStyle='white';c.fillRect(0,0,state.w,state.h);c.globalCompositeOperation='destination-out';c.drawImage(mask,0,0);c.globalCompositeOperation='destination-in';c.drawImage(state.selection,0,0);eraseMask(l,background);}
 else{const c=l.canvas.getContext('2d');c.save();c.globalCompositeOperation='destination-in';c.drawImage(mask,-l.x,-l.y);c.restore();l.modified=true;l.kind='raster';}
}
function removeBackgroundAroundSelection(l,mask,b){
 const keep=canvas(state.w,state.h),c=keep.getContext('2d');c.fillStyle='#fff';c.fillRect(b.x,b.y,b.w,b.h);c.globalCompositeOperation='destination-in';c.drawImage(mask,0,0);
 const lc=l.canvas.getContext('2d');lc.save();lc.globalCompositeOperation='destination-in';lc.drawImage(keep,-l.x,-l.y);lc.restore();l.modified=true;l.kind='raster';
}

async function projectBlob(){const s=await snapshot('Проект'),images=[],ids=new Map();async function encode(b){if(!b)return null;if(!ids.has(b)){ids.set(b,images.length);images.push(await dataUrl(b));}return ids.get(b);}const layers=[];for(const l of s.layers)layers.push({...l,blob:await encode(l.blob),baseBlob:await encode(l.baseBlob)});const selection=await encode(s.selection);return new Blob([JSON.stringify({format:'ThodCanvas',version:1,w:state.w,h:state.h,name:state.name,active:state.active,layers,selection,images})],{type:'application/json'});}
async function loadProject(file){
 const p=JSON.parse(await file.text());if(p.format!=='ThodCanvas'||p.version!==1||!Array.isArray(p.layers)||!Array.isArray(p.images)||p.layers.length>32||p.images.length>65)throw Error('Неподдерживаемый формат проекта.');checkSize(p.w,p.h);
 const blobs=p.images.map(fromDataUrl),nextLayers=[];let pixels=0;
 for(const l of p.layers){if(!Number.isFinite(l.x)||!Number.isFinite(l.y)||Math.abs(l.x)>100000||Math.abs(l.y)>100000||!Number.isFinite(l.opacity)||l.opacity<0||l.opacity>1||!blobs[l.blob]||!blobs[l.baseBlob])throw Error('Повреждён слой проекта.');const c=await fromBlob(blobs[l.blob]);checkSize(c.width,c.height);pixels+=c.width*c.height;if(pixels>MAX_LAYER_PIXELS)throw Error('Проект превышает лимит памяти слоёв.');nextLayers.push({id:String(l.id),name:String(l.name).slice(0,80),kind:l.kind==='text'?'text':'raster',x:l.x,y:l.y,opacity:l.opacity,visible:l.visible!==false,locked:!!l.locked,canvas:c,blob:blobs[l.blob],baseBlob:blobs[l.baseBlob],modified:false,text:String(l.text||''),font:FONTS.includes(l.font)?l.font:'Segoe UI',fontSize:Number(l.fontSize)||64,bold:!!l.bold,color:String(l.color||'#24262b')});}
 const selection=p.selection===null?null:await fromBlob(blobs[p.selection]);if(selection&&(selection.width!==p.w||selection.height!==p.h))throw Error('Неверный размер выделения проекта.');
 state.w=p.w;state.h=p.h;state.layers=nextLayers;state.active=nextLayers.some(l=>l.id===p.active)?p.active:nextLayers[0]?.id;state.name=String(p.name||'Проект');state.history=[];state.index=-1;state.crop=null;setSelection(selection);await commit('Открыт проект');setDirty(false);$('welcome').hidden=true;$('doc-name').textContent=state.name;fit();status('Проект со слоями открыт');
}
async function openFile(file){
 if(!file)return;if(file.size>512*1024*1024)throw Error('Файл больше 512 МБ.');
 if(state.dirty&&state.w&&!await message('Текущий проект не сохранён. Открыть другой файл?',true))return;
 if(file.name.endsWith('.thodcanvas')){
  try{await loadProject(file);}
  catch(e){throw Error('Не удалось открыть проект: '+(e.message||'файл повреждён.'));}
  return;
 }
 let image;
 try{image=await createImageBitmap(file);}
 catch{throw Error('Формат изображения не поддерживается. Откройте PNG, JPEG, WebP, AVIF или BMP.');}
 try{
  checkSize(image.width,image.height);
  const c=canvas(image.width,image.height);c.getContext('2d').drawImage(image,0,0);
  state.w=c.width;state.h=c.height;state.name=file.name.replace(/\.[^.]+$/,'');state.layers=[];state.history=[];state.index=-1;state.crop=null;setSelection(null);
  addLayer(makeLayer(c,file.name));
  await commit('Исходное изображение');setDirty(false);$('welcome').hidden=true;$('doc-name').textContent=file.name;fit();status('Изображение открыто без изменений');
 }finally{image.close();}
}
async function save(project){
 let b;
 if(project)b=await projectBlob();
 else{const c=flatten();b=await blob(c);}
 const id=await upload(b);
 try{const result=await runJob('export.save',{id,type:project?'project':'png',name:state.name});if(!result.canceled){if(project)setDirty(false);status((project?'Проект сохранён: ':'PNG сохранён: ')+result.path);}}finally{await rpc('upload.release',{id}).catch(()=>{});}
}

const menu=$('menu');
function hideMenu(){menu.hidden=true;menu.replaceChildren();}
function showMenu(x,y,items){
 menu.replaceChildren();
 for(const item of items){
  if(item.sep){const d=document.createElement('div');d.className='sep';menu.append(d);continue;}
  const b=document.createElement('button');b.type='button';b.textContent=item.label;if(item.danger)b.className='danger';b.disabled=!!item.disabled;
  b.onclick=()=>{hideMenu();item.action();};menu.append(b);
 }
 menu.hidden=false;menu.style.left='0px';menu.style.top='0px';
 const r=menu.getBoundingClientRect();
 menu.style.left=Math.min(x,innerWidth-r.width-8)+'px';
 menu.style.top=Math.min(y,innerHeight-r.height-8)+'px';
}
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target))hideMenu();},true);
window.addEventListener('blur',()=>hideMenu());

function selectionBounds(){
 if(!state.selection)return null;
 if(state.selectionBounds)return {...state.selectionBounds};
 const d=state.selection.getContext('2d').getImageData(0,0,state.w,state.h).data;
 let minX=state.w,minY=state.h,maxX=-1,maxY=-1;
 for(let y=0;y<state.h;y++)for(let x=0;x<state.w;x++)if(d[(y*state.w+x)*4+3]){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
 if(maxX<0)return null;
 state.selectionBounds={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
 return {...state.selectionBounds};
}

viewport.addEventListener('contextmenu',e=>{
 e.preventDefault();if(!state.w||state.busy||state.gesture)return;
 if(state.textEdit)finishTextEdit();
 const items=[];
 if(state.selection){
  items.push({label:'Инвертировать выделение',action:()=>$('select-invert').click()});
  items.push({label:'Залить выделенное',action:()=>$('selection-fill').click()});
  items.push({label:'Копировать на слой',action:()=>$('selection-copy').click()});
  items.push({label:'Вырезать на слой',action:()=>$('selection-cut').click()});
  items.push({label:'Удалить выделенное',action:()=>$('selection-delete').click()});
  items.push({label:'Удалить фон ИИ',action:()=>$('cutout').click()});
  items.push({label:'Кадрировать по выделению',action:async()=>{const b=selectionBounds();if(!b)return;state.crop=b;setTool('crop');await applyCrop();}});
  items.push({label:'Снять выделение',action:()=>$('select-none').click()});
  items.push({sep:true});
 }
 items.push({label:'Вписать в окно',action:fit});
 items.push({label:'Масштаб 100%',action:()=>zoom(1/state.scale)});
 showMenu(e.clientX,e.clientY,items);
});

$('tools').onclick=e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);};
$('palette').onclick=e=>{if(e.target.dataset.color){$('color').value=e.target.dataset.color;if(state.tool==='text')applyTextOption();else render();}};
$('size').oninput=()=>$('size-value').textContent=$('size').value;
$('softness').oninput=()=>$('softness-value').textContent=$('softness').value;
$('tolerance').oninput=()=>$('tolerance-value').textContent=$('tolerance').value;
$('bgcolor').oninput=()=>{$('bgcolor-hex').textContent=$('bgcolor').value.toUpperCase();};
$('color').oninput=()=>{if(state.tool==='text')applyTextOption();else render();};
$('color').onchange=()=>{if(state.tool==='text')commitTextOption();};
$('font').onchange=()=>{applyTextOption();commitTextOption();};
$('font-size').oninput=()=>applyTextOption();
$('font-size').onchange=()=>commitTextOption();
$('bold').onchange=()=>{applyTextOption();commitTextOption();};
for(const id of ['open','welcome-open'])$(id).onclick=()=>$('file').click();
$('file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)task('Открываю изображение',()=>openFile(f));};
$('undo').onclick=()=>historyStep(-1);$('redo').onclick=()=>historyStep(1);
$('fit').onclick=fit;$('actual').onclick=()=>zoom(1/state.scale);$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);
$('layer-add').onclick=()=>action('Новый слой',()=>addLayer(makeLayer(canvas(state.w,state.h),'Пустой слой')));
$('opacity').oninput=()=>{const l=activeOrNull();if(!l)return;l.opacity=clamp(+$('opacity').value/100,0,1);$('opacity-value').textContent=Math.round(l.opacity*100)+'%';render();};
$('opacity').onchange=()=>{if(activeOrNull())action('Непрозрачность слоя',async()=>{});};
$('select-rect-mode').onclick=()=>{state.selectMode='rect';toolOptions();};
$('select-lasso-mode').onclick=()=>{state.selectMode='lasso';toolOptions();};
$('select-all').onclick=()=>action('Выделить всё',()=>{const c=canvas(state.w,state.h),cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,state.w,state.h);setSelection(c,{x:0,y:0,w:state.w,h:state.h});});
$('select-none').onclick=()=>action('Снять выделение',()=>setSelection(null));
$('select-invert').onclick=()=>action('Инвертировать выделение',()=>invertSelection());
$('selection-fill').onclick=()=>action('Заливка выделения',()=>fillSelection());
$('selection-delete').onclick=()=>action('Удаление выделенного',()=>deleteSelection());
$('selection-copy').onclick=()=>action('Копировать на слой',()=>selectionToLayer(false));
$('selection-cut').onclick=()=>action('Вырезать на слой',()=>selectionToLayer(true));
$('selection-cutout').onclick=()=>removeBackgroundAI();
$('crop-apply').onclick=()=>applyCrop();
$('bg-ai-mode').onclick=()=>{state.bgMode='ai';toolOptions();};
$('bg-color-mode').onclick=()=>{state.bgMode='color';toolOptions();};
$('cutout').onclick=()=>removeBackgroundAI();
$('erase-selection').onclick=()=>action('Удаление выделенного',()=>deleteSelection());
$('export').onclick=()=>task('Экспорт PNG',()=>save(false));
$('project-save').onclick=()=>task('Сохранение проекта',()=>save(true));
$('cancel').onclick=async()=>{if(state.job){$('cancel').disabled=true;try{await rpc('job.cancel',{id:state.job});}finally{$('cancel').disabled=false;}}};

window.addEventListener('keydown',e=>{
 if(e.target.closest('dialog')||!$('menu').hidden&&e.code==='Escape'){if(e.code==='Escape')hideMenu();return;}
 if(e.code==='Escape'&&state.textEdit){e.preventDefault();finishTextEdit();return;}
 const edit=e.target.matches('textarea,input:not([type=range]):not([type=checkbox]):not([type=color])'),mod=e.ctrlKey||e.metaKey;
 if(mod&&(e.code==='KeyZ'||e.code==='KeyY')){if(edit)return;e.preventDefault();historyStep(e.code==='KeyY'||e.shiftKey?1:-1);return;}
 if(mod&&e.code==='KeyS'){e.preventDefault();if(state.w)task('Сохранение проекта',()=>save(true));return;}
 if(edit)return;
 if(e.code==='Escape'){if(state.crop){state.crop=null;sync();render();}else if(state.selection)$('select-none').click();hideMenu();return;}
 if(e.code==='Enter'&&state.tool==='crop'&&state.crop){e.preventDefault();applyCrop();return;}
 if(e.code==='Space'){state.space=true;e.preventDefault();return;}
 if(mod&&e.code==='KeyA'){e.preventDefault();if(state.w)$('select-all').click();return;}
 if(mod&&e.code==='KeyD'){e.preventDefault();if(state.w)$('select-none').click();return;}
 if(mod&&e.code==='KeyJ'){e.preventDefault();const l=activeOrNull();if(l)duplicateLayer(l);return;}
 if(mod&&e.code==='Digit0'){e.preventDefault();fit();return;}
 if(e.code==='Delete'||e.code==='Backspace'){if(state.selection){e.preventDefault();$('erase-selection').click();}return;}
 const t=tools.find(t=>t[2]&&'Key'+t[2]===e.code);if(t&&!mod&&!e.altKey){e.preventDefault();setTool(t[0]);}
});
window.addEventListener('keyup',e=>{if(e.code==='Space')state.space=false;});
window.addEventListener('blur',()=>{state.space=false;});

setTool('move');sync();render();
