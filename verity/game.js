'use strict';
const $=id=>document.getElementById(id),fmt=n=>Math.floor(n).toLocaleString('ru-RU');
const thresholds=[0,1000,5000,20000],names=['Улыбка','Не та улыбка','Раздражение','За улыбкой'],captions=['Он просто улыбается.','Улыбка стала шире. Слишком шире.','Кажется, ему это не нравится.','Теперь ты видишь его целиком.'];
const defs=[{name:'Сильное нажатие',desc:'+1 искра за клик',icon:'↗',base:120,growth:1.6},{name:'Эхо касания',desc:'+2 искры в секунду',icon:'◌',base:280,growth:1.6},{name:'Резонанс',desc:'+25% ко всему доходу',icon:'✧',base:900,growth:1.9}];
let s={total:0,wallet:0,clicks:0,levels:[0,0,0],time:0,final:false,sound:true},phase=0,playing=false,audio,resetting=false,toastTimer;
// Сохранение проверяется по полям: битое или старое значение не должно превращать счёт в NaN.
try{const v=JSON.parse(localStorage.getItem('verity-v1')),num=x=>Number.isFinite(x)&&x>=0?x:0;if(v&&typeof v==='object'){s={total:num(v.total),wallet:num(v.wallet),clicks:Math.floor(num(v.clicks)),levels:[0,1,2].map(i=>Math.floor(num(Array.isArray(v.levels)?v.levels[i]:0))),time:num(v.time),final:v.final===true,sound:v.sound!==false};if(Number.isFinite(v.finishTime))s.finishTime=v.finishTime;}}catch(e){}
const mult=()=>1+s.levels[2]*.25,power=()=> (1+s.levels[0])*mult(),rate=()=>s.levels[1]*2*mult(),cost=i=>Math.floor(defs[i].base*defs[i].growth**s.levels[i]);
function save(){if(resetting)return;try{localStorage.setItem('verity-v1',JSON.stringify(s));}catch(e){$('saved').textContent='Не удалось сохранить прогресс';}}
function ping(f=200,d=.06,volume=.04){if(!s.sound)return;try{
 audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();
 const now=audio.currentTime, duration=d>.3?1.1:Math.max(.15,d*2), gain=audio.createGain(),filter=audio.createBiquadFilter();
 filter.type='lowpass';filter.frequency.setValueAtTime(d>.3?1600:700+phase*350,now);filter.frequency.exponentialRampToValueAtTime(90,now+duration);
 gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(d>.3?.11:volume*.65,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);filter.connect(gain);gain.connect(audio.destination);
 const o=audio.createOscillator();o.type=phase>1?'sawtooth':'triangle';o.frequency.setValueAtTime(f*(phase>1?.65:1),now);o.frequency.exponentialRampToValueAtTime(d>.3?28:45,now+duration);o.connect(filter);o.start(now);o.stop(now+duration);
 const buf=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),data=buf.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(phase+1)*.16;
 const noise=audio.createBufferSource();noise.buffer=buf;noise.connect(filter);noise.start(now);noise.stop(now+duration);
 }catch(e){}}
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function render(){let old=phase;phase=thresholds.reduce((a,v,i)=>s.total>=v?i:a,0);if(old!==phase){$('portrait').src=`assets/phase${phase+1}.jpg`;toast(`Открыта фаза ${phase+1}: ${names[phase]}`);ping(90,.6);}
$('total').textContent=fmt(s.total);$('wallet').textContent=fmt(s.wallet);$('power').textContent=power().toLocaleString('ru-RU',{maximumFractionDigits:2});$('auto').textContent=rate().toLocaleString('ru-RU',{maximumFractionDigits:1});$('phaseLabel').textContent=s.final?'БЕСКОНЕЧНЫЙ РЕЖИМ':`ФАЗА 0${phase+1} / 04`;$('caption').textContent=captions[phase];$('remaining').textContent=phase<3?fmt(Math.ceil(thresholds[phase+1]-s.total)):'ВСЕ ФАЗЫ ОТКРЫТЫ';$('nextLabel').textContent=phase<3?'До следующей фазы':'Дальше — только ты и Верити';$('progress').style.width=(phase<3?(s.total-thresholds[phase])/(thresholds[phase+1]-thresholds[phase])*100:100)+'%';$('clock').textContent=`${String(Math.floor(s.time/60)).padStart(2,'0')}:${String(Math.floor(s.time%60)).padStart(2,'0')}`;$('sound').textContent=`Звук: ${s.sound?'вкл':'выкл'}`;$('replay').hidden=!s.final;
defs.forEach((d,i)=>{const b=$('up'+i);b.disabled=s.wallet<cost(i);b.querySelector('.price').textContent=fmt(cost(i));b.querySelector('.level').textContent='УРОВЕНЬ '+s.levels[i];});if(phase===3&&!s.final&&!playing)startFinal();}
function earn(n){if(playing)return;s.total+=n;s.wallet+=n;render();}
defs.forEach((d,i)=>{const b=document.createElement('button');b.className='upgrade';b.id='up'+i;b.innerHTML=`<span class="icon">${d.icon}</span><span><strong>${d.name}</strong><small>${d.desc}</small><small class="level"></small></span><span class="cost"><span class="price"></span> ✦<small>КУПИТЬ</small></span>`;b.onclick=()=>{if(s.wallet>=cost(i)){s.wallet-=cost(i);s.levels[i]++;ping(440,.12);render();save();}};$('shop').append(b);});
$('verity').onclick=e=>{if(playing)return;s.clicks++;const amount=power();earn(amount);ping(160+Math.random()*60);const f=document.createElement('span');f.className='float';f.textContent='+'+amount.toLocaleString('ru-RU',{maximumFractionDigits:2});const r=$('floats').getBoundingClientRect();f.style.left=(e.clientX?e.clientX-r.left:r.width/2)+'px';f.style.top=(e.clientY?e.clientY-r.top:r.height/2)+'px';$('floats').append(f);setTimeout(()=>f.remove(),850);};
$('sound').onclick=()=>{s.sound=!s.sound;$('movie').muted=!s.sound;render();save();};
// Время до финала идёт в таблицу лидеров FreasyGames (online.js).
function startFinal(){if(s.finishTime==null){s.finishTime=Math.round(s.time);save();window.verityOnline?.submit();}playing=true;$('cinema').hidden=false;const v=$('movie');v.src='assets/birthday.mp4';v.muted=!s.sound;v.currentTime=0;v.play().catch(()=>{v.controls=true;});}
function finish(){if(!playing)return;playing=false;s.final=true;$('movie').pause();$('cinema').hidden=true;save();render();toast('С днём рождения! Бесконечный режим открыт.');}
$('movie').onended=finish;$('movie').onerror=()=>{toast('Не удалось открыть видео. Можно продолжить игру.');};$('skip').onclick=finish;$('replay').onclick=startFinal;$('reset').onclick=()=>{if(confirm('Сбросить все клики и улучшения?')){resetting=true;localStorage.removeItem('verity-v1');location.reload();}};
phase=thresholds.reduce((a,v,i)=>s.total>=v?i:a,0);$('portrait').src=`assets/phase${phase+1}.jpg`;
// Время и автодоход считаются по реальным часам: в фоновой вкладке браузер реже вызывает таймер.
let last=performance.now();setInterval(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,2);last=now;if(!playing){s.time+=dt;earn(rate()*dt);}},100);setInterval(save,2000);window.addEventListener('pagehide',save);render();
