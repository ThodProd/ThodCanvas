'use strict';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX_PIXELS=64_000_000, MAX_LAYER_PIXELS=160_000_000, MAX_HISTORY=50;
const state={w:0,h:0,name:'Изображение',layers:[],active:null,selection:null,selectionBlob:null,history:[],index:-1,busy:false,gesture:null,tool:'move',scale:1,x:0,y:0,space:false,job:null,dirty:false};
const screen=$('screen'), viewport=$('viewport'), ctx=screen.getContext('2d');
const overlay=document.createElement('canvas');overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';viewport.insertBefore(overlay,$('welcome'));const ox=overlay.getContext('2d');
document.body.dataset.theme=new URLSearchParams(location.search).get('theme')==='dark'?'dark':'light';
const tools=[
 ['move','Перемещение','V','Перетаскивайте выбранный слой. Пробел — перемещение холста.','<path d="m12 2 3 3m-3-3L9 5m3-3v20m0 0-3-3m3 3 3-3M2 12l3-3m-3 3 3 3M2 12h20m0 0-3-3m3 3-3 3"/>'],
 ['brush','Кисть','B','Рисование на выбранном слое. Выделение ограничивает область.','<path d="m9 15 10-12 3 3-12 11M9 15c-6-2-3 6-7 6 7 2 10-2 7-6z"/>'],
 ['eraser','Ластик','E','Стирание до прозрачности. Выделение ограничивает область.','<path d="m3 14 11-11 8 8-10 11H9zm5-5 8 8M12 22h10"/>'],
 ['restore','Восстановление','R','Кисть возвращает пиксели исходного слоя.','<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6m0 4 2 2 4-5"/>'],
 ['arrow','Стрелка','A','Нарисуйте стрелку перетаскиванием.','<path d="M4 20 20 4M10 4h10v10"/>'],
 ['rect','Прямоугольник','U','Новая фигура на отдельном слое. Shift — квадрат.','<rect x="3" y="4" width="18" height="16" rx="1"/>'],
 ['ellipse','Эллипс','O','Новая фигура на отдельном слое. Shift — круг.','<ellipse cx="12" cy="12" rx="10" ry="8"/>'],
 ['text','Текст','T','Введите текст справа и щёлкните по холсту.','<path d="M3 6V3h18v3M12 3v18m-5 0h10"/>'],
 ['select-rect','Прямоугольное выделение','M','Выделите область перетаскиванием.','<path stroke-dasharray="3 3" d="M3 3h18v18H3z"/>'],
 ['select-ellipse','Овальное выделение','','Выделите область перетаскиванием.','<ellipse stroke-dasharray="3 3" cx="12" cy="12" rx="10" ry="8"/>'],
 ['lasso','Лассо','L','Обведите область. Контур замкнётся после отпускания.','<path d="M6 16C-3 7 8 1 17 4s7 14-5 14c-8 0-4-8 0-5s1 10-4 9"/>'],
 ['wand','Волшебная палочка','W','Щёлкните по цвету: выделится связная область в пределах допуска.','<path d="m3 21 12-12 3 3L6 24M17 2v4m-5-3 2 3m6 1 3-2M3 9h4"/>'],
 ['auto-eraser','Автоластик','','Щёлкните по однотонному фону. Стирается только связная область.','<path d="m3 14 10-10 8 8-9 9H9zM17 1v4m3-1 3-2M8 9l8 8"/>'],
 ['hand','Рука','H','Перемещение холста без изменения картинки.','<path d="M7 12V6a2 2 0 0 1 4 0v5-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v7-3a2 2 0 0 1 4 0v7c0 6-13 9-16 3l-4-7a2 2 0 0 1 3-2z"/>']
];
$('tools').innerHTML=tools.map(([id,name,key,,path])=>`<button data-tool="${id}" title="${name}${key?' ('+key+')':''}" aria-label="${name}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg></button>`).join('');
$('palette').innerHTML=['#24262b','#ffffff','#3676e8','#d9545e','#e2b65f','#4f9c82','#9271bb','#f28a48'].map(c=>`<button data-color="${c}" style="background:${c}" title="${c}" aria-label="Цвет ${c}"></button>`).join('');
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
const blob=c=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Не удалось сохранить холст в память.')),'image/png'));
const dataUrl=b=>new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=reject;f.readAsDataURL(b);});
async function fromBlob(b){const image=await createImageBitmap(b);const c=canvas(image.width,image.height);c.getContext('2d').drawImage(image,0,0);image.close();return c;}
function fromDataUrl(s){const parts=s.split(',');if(parts.length!==2||!parts[0].startsWith('data:image/png;base64'))throw Error('Неверное изображение проекта.');const raw=atob(parts[1]);return new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:'image/png'});}
function active(){const l=state.layers.find(l=>l.id===state.active);if(!l)throw Error('Выберите слой.');return l;}
function editable(){const l=active();if(l.locked)throw Error('Слой заблокирован. Нажмите замок рядом с ним.');if(!l.visible)throw Error('Включите видимость слоя.');return l;}
function checkSize(w,h){if(w<1||h<1||w>16384||h>16384||w*h>MAX_PIXELS)throw Error('Поддерживается до 64 Мп и 16384 px по стороне. Изображение не уменьшалось — выберите меньший исходник.');}
function checkBudget(extra=0){if(state.layers.reduce((s,l)=>s+l.canvas.width*l.canvas.height,extra)>MAX_LAYER_PIXELS||state.layers.length>=32)throw Error('Достигнут лимит памяти слоёв. Сохраните проект и удалите ненужные слои. Качество автоматически не уменьшается.');}
function layer(c,name,kind='raster',extra={}){checkBudget(c.width*c.height);return {id:crypto.randomUUID(),name,kind,x:0,y:0,opacity:1,visible:true,locked:false,canvas:c,blob:null,baseBlob:null,modified:true,...extra};}
function addLayer(l,index=state.layers.length){state.layers.splice(index,0,l);state.active=l.id;}
function setDirty(value){state.dirty=value;thodHub.call('state.dirty',{dirty:value}).catch(()=>{if(value)status('Для защиты несохранённых изменений обновите ThodHUB до 0.1.1.');});}
function status(s){$('status').textContent=s;}
async function message(text,confirm=false){$('message-title').textContent=confirm?'Продолжить?':'ThodCanvas';$('message-text').textContent=text;$('message-cancel').hidden=!confirm;const d=$('message-dialog');d.showModal();return await new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'),{once:true}));}
function setBusy(label){state.busy=true;$('busy').hidden=false;$('busy-label').textContent=label;$('progress').removeAttribute('value');$('cancel').hidden=true;sync();}
async function task(label,fn){if(state.busy||state.gesture)return;setBusy(label);try{return await fn();}catch(e){status(e.message);await message(e.message);}finally{state.busy=false;state.job=null;$('busy').hidden=true;sync();render();}}
async function snapshot(label){
 const layers=[];
 for(const l of state.layers){if(l.modified||!l.blob){l.blob=await blob(l.canvas);l.modified=false;}if(!l.baseBlob)l.baseBlob=l.blob;const {canvas:c,baseCanvas,modified,...saved}=l;layers.push({...saved});}
 if(state.selection&&!state.selectionBlob)state.selectionBlob=await blob(state.selection);
 return {label,layers,active:state.active,selection:state.selectionBlob,w:state.w,h:state.h,name:state.name};
}
async function commit(label){const saved=await snapshot(label);state.history.splice(state.index+1);state.history.push(saved);state.index=state.history.length-1;while(state.history.length>MAX_HISTORY||historySize()>256*1024*1024&&state.history.length>2){state.history.shift();state.index--;}setDirty(true);renderLayers();sync();render();status(label+' · изменения не сохранены');}
function historySize(){const blobs=new Set();for(const s of state.history){for(const l of s.layers){blobs.add(l.blob);blobs.add(l.baseBlob);}if(s.selection)blobs.add(s.selection);}return [...blobs].reduce((n,b)=>n+(b?.size||0),0);}
async function restore(s){const next=[];for(const l of s.layers){next.push({...l,canvas:await fromBlob(l.blob),modified:false});}state.layers=next;state.active=s.active;state.selection=s.selection?await fromBlob(s.selection):null;state.selectionBlob=s.selection;state.w=s.w;state.h=s.h;state.name=s.name;renderLayers();render();}
async function mutate(label,fn){const before=state.history[state.index];try{await fn();await commit(label);}catch(e){if(before)await restore(before);throw e;}}
function action(label,fn){return task(label,()=>mutate(label,fn));}
async function historyStep(delta){return task(delta<0?'Отмена':'Повтор',async()=>{const n=state.index+delta;if(n<0||n>=state.history.length)return;await restore(state.history[n]);state.index=n;setDirty(true);status(state.history[n].label);});}
function setTool(id){if(state.busy||state.gesture)return;state.tool=id;const t=tools.find(t=>t[0]===id);$('tool-title').textContent=t[1];$('tool-hint').textContent=t[3];viewport.style.cursor=id==='hand'?'grab':id==='move'?'move':'crosshair';document.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===id);b.setAttribute('aria-pressed',b.dataset.tool===id);});}
function sync(){const has=!!state.w,locked=state.busy||!!state.gesture;for(const field of document.querySelectorAll('aside input,aside textarea'))field.disabled=locked;for(const b of document.querySelectorAll('aside button,#tools button'))b.disabled=!has||locked;$('undo').disabled=locked||state.index<=0;$('redo').disabled=locked||state.index>=state.history.length-1;for(const id of ['export','project-save'])$(id).disabled=!has||locked;for(const id of ['open','welcome-open'])$(id).disabled=locked;$('dimensions').textContent=has?`${state.w} × ${state.h} px · ${Math.round(state.scale*100)}%`:'';$('history').innerHTML=state.history.slice(0,state.index+1).map(s=>`<li>${esc(s.label)}</li>`).join('');}
function fit(){if(!state.w)return;state.scale=Math.min((viewport.clientWidth-70)/state.w,(viewport.clientHeight-100)/state.h,1);state.scale=Math.max(.005,state.scale);state.x=(viewport.clientWidth-state.w*state.scale)/2;state.y=(viewport.clientHeight-state.h*state.scale)/2;render();sync();}
function zoom(factor,p={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){const n=Math.max(.005,Math.min(32,state.scale*factor)),x=(p.x-state.x)/state.scale,y=(p.y-state.y)/state.scale;state.x=p.x-x*n;state.y=p.y-y*n;state.scale=n;render();sync();}
let frame=0;
function render(){if(!frame)frame=requestAnimationFrame(paint);}
function paint(){
 frame=0;const dpr=devicePixelRatio||1,w=viewport.clientWidth,h=viewport.clientHeight;
 for(const c of [screen,overlay])if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ox.setTransform(dpr,0,0,dpr,0,0);ox.clearRect(0,0,w,h);
 if(!state.w)return;
 const tile=canvas(16,16),tc=tile.getContext('2d');tc.fillStyle='#fff';tc.fillRect(0,0,16,16);tc.fillStyle='#e1e4e8';tc.fillRect(0,0,8,8);tc.fillRect(8,8,8,8);
 ctx.save();ctx.translate(state.x,state.y);ctx.fillStyle=ctx.createPattern(tile,'repeat');ctx.fillRect(0,0,state.w*state.scale,state.h*state.scale);ctx.scale(state.scale,state.scale);ctx.beginPath();ctx.rect(0,0,state.w,state.h);ctx.clip();
 for(const l of state.layers)if(l.visible){ctx.globalAlpha=l.opacity;ctx.drawImage(l.canvas,l.x,l.y);}ctx.restore();
 ox.save();ox.translate(state.x,state.y);ox.scale(state.scale,state.scale);
 if(state.selection){ox.globalAlpha=.24;ox.drawImage(state.selection,0,0);ox.globalCompositeOperation='source-in';ox.fillStyle='#3676e8';ox.fillRect(0,0,state.w,state.h);ox.globalCompositeOperation='source-over';ox.globalAlpha=1;}
 const g=state.gesture;
 if(g?.type==='shape'||g?.type==='selection'){ox.strokeStyle=g.type==='selection'?'#3676e8':$('color').value;ox.lineWidth=g.type==='selection'?1.5/state.scale:+$('size').value;ox.setLineDash(g.type==='selection'?[5/state.scale,4/state.scale]:[]);drawPath(ox,g.tool,g.start,g.end,g.points);ox.stroke();}
 if(state.tool==='move'){const l=state.layers.find(l=>l.id===state.active);if(l&&l.visible){ox.strokeStyle='#3676e8';ox.lineWidth=1/state.scale;ox.setLineDash([4/state.scale,3/state.scale]);ox.strokeRect(l.x,l.y,l.canvas.width,l.canvas.height);}}
 ox.restore();
}
function point(e){const r=viewport.getBoundingClientRect();return{x:(e.clientX-r.left-state.x)/state.scale,y:(e.clientY-r.top-state.y)/state.scale};}
function bounds(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.max(1,Math.abs(a.x-b.x)),h:Math.max(1,Math.abs(a.y-b.y))};}
function drawPath(c,tool,a,b,points){c.beginPath();const r=bounds(a,b);if(tool.includes('ellipse'))c.ellipse(r.x+r.w/2,r.y+r.h/2,r.w/2,r.h/2,0,0,Math.PI*2);else if(tool==='lasso'){c.moveTo(points[0].x,points[0].y);for(const p of points)c.lineTo(p.x,p.y);c.closePath();}else if(tool==='arrow'){c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);const angle=Math.atan2(b.y-a.y,b.x-a.x),size=Math.max(14,+$('size').value*3);c.moveTo(b.x-size*Math.cos(angle-.5),b.y-size*Math.sin(angle-.5));c.lineTo(b.x,b.y);c.lineTo(b.x-size*Math.cos(angle+.5),b.y-size*Math.sin(angle+.5));}else c.rect(r.x,r.y,r.w,r.h);}
function applySelection(c,x=0,y=0){if(!state.selection)return;const cctx=c.getContext('2d');cctx.save();cctx.globalCompositeOperation='destination-in';cctx.drawImage(state.selection,-x,-y);cctx.restore();}
function setSelection(c){state.selection=c;state.selectionBlob=null;}
function fullLayer(l){const c=canvas(state.w,state.h);c.getContext('2d').drawImage(l.canvas,l.x,l.y);return c;}
async function baseCanvas(l){return l.baseCanvas??=await fromBlob(l.baseBlob||l.blob);}
function stamp(l,p,tool){
 const size=+$('size').value,r=size/2,left=Math.floor(p.x-r-2),top=Math.floor(p.y-r-2),side=Math.ceil(size+4),patch=canvas(side,side),pc=patch.getContext('2d'),soft=+$('softness').value/100;
 if(soft){const gradient=pc.createRadialGradient(p.x-left,p.y-top,r*(1-soft),p.x-left,p.y-top,r);gradient.addColorStop(0,$('color').value);gradient.addColorStop(1,'transparent');pc.fillStyle=gradient;}else pc.fillStyle=$('color').value;
 pc.beginPath();pc.arc(p.x-left,p.y-top,r,0,Math.PI*2);pc.fill();applySelection(patch,left,top);
 const target=l.canvas.getContext('2d');target.save();target.globalCompositeOperation=tool==='brush'?'source-over':'destination-out';target.drawImage(patch,left-l.x,top-l.y);
 if(tool==='restore'){pc.globalCompositeOperation='source-in';pc.drawImage(l.baseCanvas,l.x-left,l.y-top);target.globalCompositeOperation='source-over';target.drawImage(patch,left-l.x,top-l.y);}
 target.restore();l.modified=true;l.kind='raster';
}
function stroke(l,a,b,tool){const distance=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(distance/Math.max(1,+$('size').value/5)));for(let i=1;i<=steps;i++)stamp(l,{x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps},tool);}
viewport.addEventListener('pointerdown',async e=>{
 if(!state.w||state.busy||state.gesture||e.target!==screen)return;
 const p=point(e);if(e.button===1||state.space||state.tool==='hand'){state.gesture={type:'pan',cx:e.clientX,cy:e.clientY,x:state.x,y:state.y};viewport.setPointerCapture(e.pointerId);e.preventDefault();return;}
 if(e.button!==0)return;
 try{
  if(state.tool==='wand'||state.tool==='auto-eraser'){await action('Выделение по цвету',()=>wand(p,state.tool==='auto-eraser'));return;}
  if(state.tool==='text'){await action('Текст',()=>makeText(p));return;}
  const l=['move','brush','eraser','restore'].includes(state.tool)?editable():null;
  if(state.tool==='restore'){viewport.setPointerCapture(e.pointerId);setBusy('Подготовка исходного слоя');try{await baseCanvas(l);}finally{state.busy=false;$('busy').hidden=true;sync();}if(!viewport.hasPointerCapture(e.pointerId))return;}
  const type=state.tool==='move'?'move':['brush','eraser','restore'].includes(state.tool)?'stroke':state.tool.startsWith('select-')||state.tool==='lasso'?'selection':'shape';
  state.gesture={type,tool:state.tool,start:p,end:p,last:p,points:[p],layer:l,x:l?.x,y:l?.y};
  if(type==='stroke')stamp(l,p,state.tool);
  viewport.setPointerCapture(e.pointerId);sync();render();e.preventDefault();
 }catch(error){await message(error.message);}
});
viewport.addEventListener('pointermove',e=>{
 const g=state.gesture;if(!g)return;
 if(g.type==='pan'){state.x=g.x+e.clientX-g.cx;state.y=g.y+e.clientY-g.cy;render();return;}
 let p=point(e);if(e.shiftKey&&['rect','ellipse','select-rect','select-ellipse'].includes(g.tool)){const n=Math.max(Math.abs(p.x-g.start.x),Math.abs(p.y-g.start.y));p={x:g.start.x+Math.sign(p.x-g.start.x||1)*n,y:g.start.y+Math.sign(p.y-g.start.y||1)*n};}
 if(g.type==='move'){g.layer.x=Math.round(g.x+p.x-g.start.x);g.layer.y=Math.round(g.y+p.y-g.start.y);}
 if(g.type==='stroke')stroke(g.layer,g.last,p,g.tool);
 if(g.tool==='lasso')g.points.push(p);
 g.end=p;g.last=p;render();
});
viewport.addEventListener('pointerup',e=>{
 const g=state.gesture;if(!g)return;state.gesture=null;if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
 if(g.type==='pan'){sync();return;}
 task(tools.find(t=>t[0]===g.tool)[1],()=>mutate(tools.find(t=>t[0]===g.tool)[1],async()=>{
  if(g.type==='selection'){const c=canvas(state.w,state.h),cctx=c.getContext('2d');cctx.fillStyle='white';drawPath(cctx,g.tool,g.start,g.end,g.points);cctx.fill();setSelection(c);}
  if(g.type==='shape'){const pad=+$('size').value*4+4,r=bounds(g.start,g.end),x=Math.floor(r.x-pad),y=Math.floor(r.y-pad);checkSize(Math.ceil(r.w+pad*2),Math.ceil(r.h+pad*2));const c=canvas(Math.ceil(r.w+pad*2),Math.ceil(r.h+pad*2)),cctx=c.getContext('2d');cctx.translate(-x,-y);cctx.strokeStyle=cctx.fillStyle=$('color').value;cctx.lineWidth=+$('size').value;cctx.lineJoin=cctx.lineCap='round';drawPath(cctx,g.tool,g.start,g.end,g.points);if($('fill').checked&&g.tool!=='arrow')cctx.fill();else cctx.stroke();cctx.setTransform(1,0,0,1,0,0);applySelection(c,x,y);addLayer(layer(c,tools.find(t=>t[0]===g.tool)[1],'shape',{x,y}));}
 }));
});
viewport.addEventListener('pointercancel',()=>{if(!state.gesture)return;const g=state.gesture;state.gesture=null;if(g.type!=='pan')task('Отмена незавершённого действия',()=>restore(state.history[state.index]));else sync();});
viewport.addEventListener('wheel',e=>{if(!state.w)return;e.preventDefault();const r=viewport.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
viewport.addEventListener('contextmenu',e=>e.preventDefault());
new ResizeObserver(()=>{render();sync();}).observe(viewport);
function renderLayers(){
 $('layers').replaceChildren();
 for(const l of [...state.layers].reverse()){
  const row=document.createElement('div');row.className='layer'+(l.id===state.active?' selected':'')+(!l.visible?' hidden':'');row.dataset.layer=l.id;
  const thumb=canvas(32,32),t=thumb.getContext('2d'),scale=Math.min(32/l.canvas.width,32/l.canvas.height);t.drawImage(l.canvas,(32-l.canvas.width*scale)/2,(32-l.canvas.height*scale)/2,l.canvas.width*scale,l.canvas.height*scale);
  row.innerHTML=`<img src="${thumb.toDataURL()}" alt=""><div class="layer-info"><input value="${esc(l.name)}" aria-label="Имя слоя"><small>${l.kind==='text'?'Текст':l.kind==='shape'?'Фигура':'Изображение'} · ${Math.round(l.opacity*100)}%</small></div><button data-visible title="Показать / скрыть">${l.visible?'◉':'○'}</button><button data-lock title="Блокировка">${l.locked?'●':'◇'}</button>`;
  row.onclick=e=>{if(state.busy||state.gesture||e.target.closest('button,input'))return;state.active=l.id;renderLayers();render();};
  row.querySelector('input').onchange=e=>action('Переименование слоя',()=>{l.name=e.target.value.slice(0,80)||'Слой';});
  row.querySelector('[data-visible]').onclick=()=>action('Видимость слоя',()=>{l.visible=!l.visible;});
  row.querySelector('[data-lock]').onclick=()=>action('Блокировка слоя',()=>{l.locked=!l.locked;});
  $('layers').append(row);
 }
 const l=state.layers.find(l=>l.id===state.active);$('opacity').value=l?Math.round(l.opacity*100):100;
 if(l?.kind==='text'){$('text').value=l.text;$('font-size').value=l.fontSize;$('bold').checked=l.bold;}
}
async function openFile(file,asLayer=false,asBackground=false){
 if(!file)return;if(file.size>512*1024*1024)throw Error('Файл больше 512 МБ.');
 if(!asLayer&&!asBackground&&state.dirty&&!await message('Текущий проект не сохранён. Открыть другой файл?',true))return;
 if(file.name.endsWith('.thodcanvas')){if(asLayer||asBackground)throw Error('Проект нужно открывать кнопкой «Открыть».');await loadProject(file);return;}
 const image=await createImageBitmap(file);try{checkSize(image.width,image.height);if(asLayer||asBackground)checkBudget(image.width*image.height);const c=canvas(image.width,image.height);c.getContext('2d').drawImage(image,0,0);
 if(asLayer||asBackground){await mutate('Добавлено изображение',async()=>{const l=layer(c,file.name);l.x=Math.round((state.w-c.width)/2);l.y=Math.round((state.h-c.height)/2);if(asBackground){const target=editable(),mask=await aiMask(target);removeBackground(target,mask,false);addLayer(l,state.layers.indexOf(target));state.active=target.id;}else addLayer(l);});}
 else {state.w=c.width;state.h=c.height;state.name=file.name.replace(/\.[^.]+$/,'');state.layers=[];state.history=[];state.index=-1;setSelection(null);addLayer(layer(c,file.name));await commit('Исходное изображение');setDirty(false);$('welcome').hidden=true;$('doc-name').textContent=file.name;fit();status('Изображение открыто без изменений');}
 }finally{image.close();}
}
function textCanvas(text,size,bold,color){const lines=text.split('\n').slice(0,100),measure=canvas(1,1).getContext('2d');measure.font=`${bold?'600':'400'} ${size}px "Segoe UI", sans-serif`;const w=Math.ceil(Math.max(1,...lines.map(s=>measure.measureText(s).width))+12),h=Math.ceil(lines.length*size*1.3+12);checkSize(w,h);const c=canvas(w,h),cctx=c.getContext('2d');cctx.font=measure.font;cctx.fillStyle=color;cctx.textBaseline='top';lines.forEach((s,i)=>cctx.fillText(s,6,6+i*size*1.3));return c;}
function makeText(p,replace=null){const text=$('text').value.slice(0,10000);if(!text.trim())throw Error('Введите текст справа.');const size=Math.max(6,Math.min(1000,+$('font-size').value||64)),bold=$('bold').checked,color=$('color').value,c=textCanvas(text,size,bold,color);applySelection(c,p.x,p.y);const extra={x:p.x,y:p.y,text,fontSize:size,bold,color};if(replace){checkBudget(Math.max(0,c.width*c.height-replace.canvas.width*replace.canvas.height));Object.assign(replace,extra,{canvas:c,modified:true,baseBlob:null,baseCanvas:null});}else addLayer(layer(c,text.slice(0,28),'text',extra));}
// Pixel analysis runs outside the UI thread; input and output buffers are transferred, never copied in JSON.
function pixelWork(data){return new Promise((resolve,reject)=>{const code=`(${pixelWorker.toString()})();`,url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));const worker=new Worker(url);URL.revokeObjectURL(url);worker.onmessage=e=>{worker.terminate();resolve(new Uint8ClampedArray(e.data));};worker.onerror=e=>{worker.terminate();reject(Error(e.message||'Ошибка обработки пикселей.'));};worker.postMessage(data,[data.pixels.buffer]);});}
function pixelWorker(){self.onmessage=e=>{if(e.data.kind==='outline'){const {pixels,w,h,radius,color}=e.data,src=new Uint8Array(w*h),horizontal=new Uint8Array(w*h),vertical=new Uint8Array(w*h);for(let i=0;i<src.length;i++)src[i]=pixels[i*4+3];function pass(input,output,rows,cols,stride,step){const queue=new Int32Array(cols);for(let row=0;row<rows;row++){let head=0,tail=0,right=0;for(let col=0;col<cols;col++){const end=Math.min(cols-1,col+radius);while(right<=end){while(tail>head&&input[row*stride+queue[tail-1]*step]<=input[row*stride+right*step])tail--;queue[tail++]=right++;}while(tail>head&&queue[head]<col-radius)head++;output[row*stride+col*step]=input[row*stride+queue[head]*step];}}}pass(src,horizontal,h,w,w,1);pass(horizontal,vertical,w,h,1,w);const output=new Uint8ClampedArray(w*h*4);for(let i=0;i<src.length;i++){output[i*4]=color[0];output[i*4+1]=color[1];output[i*4+2]=color[2];output[i*4+3]=Math.max(0,vertical[i]-src[i]);}self.postMessage(output.buffer,[output.buffer]);return;}const {pixels,w,h,x,y,tolerance}=e.data,mask=new Uint8ClampedArray(w*h*4),visited=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;const start=Math.min(w*h-1,Math.max(0,y*w+x)),offset=start*4,base=[pixels[offset],pixels[offset+1],pixels[offset+2],pixels[offset+3]],limit=tolerance*tolerance*4;queue[tail++]=start;visited[start]=1;while(head<tail){const n=queue[head++],i=n*4;let distance=0;for(let k=0;k<4;k++)distance+=(pixels[i+k]-base[k])**2;if(distance>limit)continue;mask[i]=mask[i+1]=mask[i+2]=mask[i+3]=255;const col=n%w;for(const v of [col?n-1:-1,col<w-1?n+1:-1,n-w,n+w])if(v>=0&&v<w*h&&!visited[v]){visited[v]=1;queue[tail++]=v;}}self.postMessage(mask.buffer,[mask.buffer]);};}
async function wand(p,erase){const l=editable(),c=fullLayer(l),pixels=c.getContext('2d').getImageData(0,0,state.w,state.h).data;const mask=await pixelWork({pixels,w:state.w,h:state.h,x:Math.max(0,Math.min(state.w-1,Math.floor(p.x))),y:Math.max(0,Math.min(state.h-1,Math.floor(p.y))),tolerance:+$('tolerance').value});const selection=canvas(state.w,state.h);selection.getContext('2d').putImageData(new ImageData(mask,state.w,state.h),0,0);if(erase){if(state.selection){selection.getContext('2d').globalCompositeOperation='destination-in';selection.getContext('2d').drawImage(state.selection,0,0);}eraseMask(l,selection);}else setSelection(selection);}
function eraseMask(l,mask){const c=l.canvas.getContext('2d');c.save();c.globalCompositeOperation='destination-out';c.drawImage(mask,-l.x,-l.y);c.restore();l.modified=true;l.kind='raster';}
const rpc=(method,params)=>thodHub.call('worker.'+method,params);
async function upload(b){const {id}=await rpc('upload.begin');try{for(let offset=0;offset<b.size;offset+=512*1024){const part=await dataUrl(b.slice(offset,offset+512*1024));await rpc('upload.write',{id,offset,base64:part.split(',')[1]});$('progress').value=offset/b.size*15;}await rpc('upload.finish',{id});return id;}catch(e){await rpc('upload.release',{id}).catch(()=>{});throw e;}}
async function runJob(kind,params){const {jobId}=await rpc('job.start',{kind,params});state.job=jobId;$('cancel').hidden=kind==='export.save';while(true){const job=await rpc('job.status',{id:jobId});$('busy-label').textContent=job.message||'Обработка';$('progress').value=job.progress||0;if(job.state==='done'){state.job=null;return job.result;}if(job.state==='error'||job.state==='canceled'){state.job=null;throw Error(job.error||'Операция отменена.');}await new Promise(r=>setTimeout(r,200));}}
async function aiMask(l){$('busy-label').textContent='Подготовка изображения для IS-Net';const c=fullLayer(l),id=await upload(await blob(c));try{const result=await runJob('mask',{id});const small=await fromBlob(fromDataUrl(result.mask)),sctx=small.getContext('2d'),pixels=sctx.getImageData(0,0,small.width,small.height);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i+3]=pixels.data[i];pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;}sctx.putImageData(pixels,0,0);const mask=canvas(state.w,state.h);mask.getContext('2d').drawImage(small,0,0,state.w,state.h);return mask;}finally{await rpc('upload.release',{id}).catch(()=>{});}}
function removeBackground(l,mask,respectSelection=true){if(respectSelection&&state.selection){const background=canvas(state.w,state.h),c=background.getContext('2d');c.fillStyle='white';c.fillRect(0,0,state.w,state.h);c.globalCompositeOperation='destination-out';c.drawImage(mask,0,0);c.globalCompositeOperation='destination-in';c.drawImage(state.selection,0,0);eraseMask(l,background);}else{const c=l.canvas.getContext('2d');c.save();c.globalCompositeOperation='destination-in';c.drawImage(mask,-l.x,-l.y);c.restore();l.modified=true;l.kind='raster';}}
async function backgroundEffect(kind){const l=editable(),mask=await aiMask(l),index=state.layers.indexOf(l),c=canvas(state.w,state.h),cx=c.getContext('2d');checkBudget(state.w*state.h);if(kind==='color'){cx.fillStyle=$('color').value;cx.fillRect(0,0,state.w,state.h);}else if(kind==='blur'){cx.filter=`blur(${+$('effect-size').value}px)`;cx.drawImage(fullLayer(l),0,0);cx.filter='none';}else{const hex=$('color').value.slice(1),color=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)),pixels=mask.getContext('2d').getImageData(0,0,state.w,state.h).data;const output=await pixelWork({kind:'outline',pixels,w:state.w,h:state.h,radius:+$('effect-size').value,color});cx.putImageData(new ImageData(output,state.w,state.h),0,0);}removeBackground(l,mask,false);addLayer(layer(c,kind==='color'?'Цвет фона':kind==='blur'?'Размытый фон':'Обводка'),index);state.active=l.id;}
async function projectBlob(){const s=await snapshot('Проект'),images=[],ids=new Map();async function encode(b){if(!b)return null;if(!ids.has(b)){ids.set(b,images.length);images.push(await dataUrl(b));}return ids.get(b);}const layers=[];for(const l of s.layers){layers.push({...l,blob:await encode(l.blob),baseBlob:await encode(l.baseBlob)});}const selection=await encode(s.selection);return new Blob([JSON.stringify({format:'ThodCanvas',version:1,w:state.w,h:state.h,name:state.name,active:state.active,layers,selection,images})],{type:'application/json'});}
async function loadProject(file){
 const p=JSON.parse(await file.text());if(p.format!=='ThodCanvas'||p.version!==1||!Array.isArray(p.layers)||!Array.isArray(p.images)||p.layers.length>32||p.images.length>65)throw Error('Неподдерживаемый формат проекта.');checkSize(p.w,p.h);
 const blobs=p.images.map(fromDataUrl),next=[];let pixels=0;
 for(const l of p.layers){if(!Number.isFinite(l.x)||!Number.isFinite(l.y)||Math.abs(l.x)>100000||Math.abs(l.y)>100000||!Number.isFinite(l.opacity)||l.opacity<0||l.opacity>1||!blobs[l.blob]||!blobs[l.baseBlob])throw Error('Повреждён слой проекта.');const c=await fromBlob(blobs[l.blob]);checkSize(c.width,c.height);pixels+=c.width*c.height;if(pixels>MAX_LAYER_PIXELS)throw Error('Проект превышает лимит памяти слоёв.');next.push({id:String(l.id),name:String(l.name).slice(0,80),kind:l.kind==='text'?'text':'raster',x:l.x,y:l.y,opacity:l.opacity,visible:l.visible!==false,locked:!!l.locked,canvas:c,blob:blobs[l.blob],baseBlob:blobs[l.baseBlob],modified:false,text:String(l.text||''),fontSize:Number(l.fontSize)||64,bold:!!l.bold,color:String(l.color||'#24262b')});}
 const selection=p.selection===null?null:await fromBlob(blobs[p.selection]);if(selection&&(selection.width!==p.w||selection.height!==p.h))throw Error('Неверный размер выделения проекта.');
 state.w=p.w;state.h=p.h;state.layers=next;state.active=next.some(l=>l.id===p.active)?p.active:next[0]?.id;state.name=String(p.name||'Проект');state.history=[];state.index=-1;setSelection(selection);await commit('Открыт проект');setDirty(false);$('welcome').hidden=true;$('doc-name').textContent=state.name;fit();status('Проект со слоями открыт');
}
async function save(project){let b;if(project)b=await projectBlob();else{const c=canvas(state.w,state.h),cx=c.getContext('2d');for(const l of state.layers)if(l.visible){cx.globalAlpha=l.opacity;cx.drawImage(l.canvas,l.x,l.y);}b=await blob(c);}const id=await upload(b);try{const result=await runJob('export.save',{id,type:project?'project':'png',name:state.name});if(!result.canceled){if(project)setDirty(false);status((project?'Проект сохранён: ':'PNG сохранён: ')+result.path);}}finally{await rpc('upload.release',{id}).catch(()=>{});}}
function wire(id,label,fn,mutation=true){$(id).onclick=()=>mutation?action(label,fn):task(label,fn);}
$('tools').onclick=e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);};$('palette').onclick=e=>{if(e.target.dataset.color)$('color').value=e.target.dataset.color;};
$('size').oninput=()=>$('size-value').textContent=$('size').value;
for(const id of ['open','welcome-open'])$(id).onclick=()=>$('file').click();
$('file').onchange=e=>{const f=e.target.files[0];e.target.value='';task('Открываю изображение',()=>openFile(f));};
$('layer-import').onclick=()=>$('layer-file').click();$('layer-file').onchange=e=>{const f=e.target.files[0];e.target.value='';task('Добавляю слой',()=>openFile(f,true));};
$('background-image').onclick=()=>$('background-file').click();$('background-file').onchange=e=>{const f=e.target.files[0];e.target.value='';task('Замена фона',()=>openFile(f,false,true));};
viewport.addEventListener('dragover',e=>e.preventDefault());viewport.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer.files[0];task('Открываю изображение',()=>openFile(f));});
$('undo').onclick=()=>historyStep(-1);$('redo').onclick=()=>historyStep(1);$('fit').onclick=fit;$('actual').onclick=()=>zoom(1/state.scale);$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);
wire('layer-add','Новый слой',()=>addLayer(layer(canvas(state.w,state.h),'Пустой слой')));
wire('layer-delete','Удаление слоя',()=>{const l=editable(),i=state.layers.indexOf(l);state.layers.splice(i,1);state.active=state.layers[Math.max(0,i-1)]?.id;});
wire('layer-copy','Дубликат слоя',async()=>{const l=active(),copy=await fromBlob(l.blob);addLayer(layer(copy,l.name+' — копия',l.kind,{x:l.x,y:l.y,opacity:l.opacity,baseBlob:l.baseBlob,text:l.text,fontSize:l.fontSize,bold:l.bold,color:l.color}),state.layers.indexOf(l)+1);});
for(const [id,delta] of [['layer-up',1],['layer-down',-1]])wire(id,'Порядок слоёв',()=>{const l=active(),i=state.layers.indexOf(l),n=Math.max(0,Math.min(state.layers.length-1,i+delta));state.layers.splice(i,1);state.layers.splice(n,0,l);});
$('opacity').onchange=()=>action('Непрозрачность',()=>{editable().opacity=+$('opacity').value/100;});
wire('text-apply','Изменение текста',()=>{const l=editable();if(l.kind!=='text')throw Error('Выберите текстовый слой.');makeText({x:l.x,y:l.y},l);});
wire('select-all','Выделить всё',()=>{const c=canvas(state.w,state.h),cx=c.getContext('2d');cx.fillStyle='white';cx.fillRect(0,0,state.w,state.h);setSelection(c);});
wire('select-none','Снять выделение',()=>setSelection(null));
wire('select-invert','Инверсия выделения',()=>{const c=canvas(state.w,state.h),cx=c.getContext('2d');cx.fillStyle='white';cx.fillRect(0,0,state.w,state.h);if(state.selection){cx.globalCompositeOperation='destination-out';cx.drawImage(state.selection,0,0);}setSelection(c);});
wire('selection-delete','Стереть выделенное',()=>{if(!state.selection)throw Error('Сначала выделите область.');eraseMask(editable(),state.selection);});
wire('select-ai','Автовыделение IS-Net',async()=>setSelection(await aiMask(editable())));
wire('cutout','Удаление фона',async()=>{const l=editable();removeBackground(l,await aiMask(l));});
wire('background-color','Замена фона цветом',()=>backgroundEffect('color'));wire('background-blur','Размытие фона',()=>backgroundEffect('blur'));wire('outline','Обводка объекта',()=>backgroundEffect('outline'));
wire('export','Экспорт PNG',()=>save(false),false);wire('project-save','Сохранение проекта',()=>save(true),false);
$('cancel').onclick=async()=>{if(state.job){$('cancel').disabled=true;try{await rpc('job.cancel',{id:state.job});}finally{$('cancel').disabled=false;}}};
window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,dialog'))return;if(e.key===' '){state.space=true;e.preventDefault();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();historyStep(e.shiftKey?1:-1);return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();historyStep(1);return;}if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();task('Сохранение проекта',()=>save(true));return;}if(e.ctrlKey&&e.key.toLowerCase()==='a'){e.preventDefault();$('select-all').click();return;}if(e.ctrlKey&&e.key.toLowerCase()==='d'){e.preventDefault();$('select-none').click();return;}if(e.key==='Delete'){$('selection-delete').click();return;}const t=tools.find(t=>t[2]&&t[2].toLowerCase()===e.key.toLowerCase());if(t&&!e.ctrlKey&&!e.altKey)setTool(t[0]);});
window.addEventListener('keyup',e=>{if(e.key===' ')state.space=false;});window.addEventListener('blur',()=>state.space=false);

setTool('move');sync();render();
