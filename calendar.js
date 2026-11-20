'use strict';

const $ = id => document.getElementById(id);
const storageKey = 'quality-team-calendar-v1';
const dailyLimit = 2;
const weekdayNames = Array.from('일월화수목금토');
const zone = 'Asia/Seoul';
const koreaDate = new Intl.DateTimeFormat('sv-SE', {timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit'});
const displayDate = new Intl.DateTimeFormat('ko-KR', {month:'long', day:'numeric', weekday:'short', timeZone:'UTC'});
const kinds = {
  WE:['WE · 비행','#dbe9fd'], SIM:['SIM','#eadff8'], FTD:['FTD','#e5eafa'], STFF:['STFF','#dcf4dd'],
  '지상교육':['지상교육','#f5ebe0'], '회의':['회의','#f9e0dc'], '연차':['연차','#d7edf2'], OFF:['OFF','#e9edf1'],
  AUDIT:['AUDIT','#e0e9cc'], '행사':['행사','#fadfee'], ICDN:['ICDN','#f8ead8'], custom:['직접입력','#e9edf4']
};
const legacyKinds = {
  '훈련':['훈련','#eadff8'], '교육':['교육','#fff0c8'], '대기':['대기','#fbe6cf'], '휴무':['휴무','#dcefe6']
};
const memberTints = {
  '#f0f5ff':'파랑', '#f8f3fc':'보라', '#f0f8f4':'초록', '#fcf7f0':'주황',
  '#fdf2f5':'분홍', '#fdf9e9':'노랑', '#eef8fa':'하늘', '#f3f5f8':'회색'
};
const seedMembers = [
  {id:'min',name:'김민준',color:'#f0f5ff',visible:true}, {id:'seo',name:'이서연',color:'#f8f3fc',visible:true},
  {id:'ha',name:'박하늘',color:'#f0f8f4',visible:true}, {id:'woo',name:'최지우',color:'#fcf7f0',visible:true}
];
const seedEntries = [
  [2,'min','WE','531'],[3,'seo','SIM'],[4,'ha','STFF'],[5,'woo','WE','514'],[6,'min','OFF'],[6,'ha','WE','854'],
  [7,'seo','WE','532'],[8,'seo','WE','501'],[9,'woo','지상교육'],[10,'min','회의'],[10,'ha','OFF'],[11,'ha','WE','531'],[12,'seo','연차'],
  [13,'woo','WE','532'],[13,'min','FTD'],[14,'ha','WE','502'],[15,'ha','OFF'],[16,'seo','WE','514'],[17,'min','AUDIT'],
  [18,'woo','SIM'],[18,'seo','지상교육'],[19,'ha','회의'],[20,'seo','FTD'],[20,'ha','OFF'],[21,'woo','행사'],[22,'woo','WE','501'],
  [23,'min','지상교육'],[24,'seo','회의'],[24,'ha','OFF'],[25,'ha','WE','532'],[26,'woo','ICDN'],[27,'min','OFF'],[27,'seo','WE','854'],
  [28,'min','WE','514'],[29,'ha','WE','514'],[30,'woo','연차'],[30,'min','회의']
].map(([day, member, type, detail=''], i)=>({id:`sample-${i}`, date:`2026-11-${String(day).padStart(2,'0')}`, member, type, detail}));

const today = () => koreaDate.format(new Date());
const utc = (year, month, day) => new Date(Date.UTC(year,month,day));
const stamp = day => day.toISOString().slice(0,10);
const dateObject = value => new Date(`${value}T00:00:00Z`);
const memberById = id => state.members.find(member => member.id===id);
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let state = load();
let currentMonth = dateObject(today());
let todayShown = today();
let active = null;
let toast;
let readOnly = window.matchMedia('(pointer: coarse)').matches;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved?.members) && Array.isArray(saved?.entries)) return saved;
  } catch {}
  return {members:seedMembers,entries:seedEntries};
}

function notify(message) {
  const status=$('status');
  status.textContent=message;
  status.hidden=false;
  clearTimeout(toast);
  toast=setTimeout(()=>status.hidden=true,3100);
}

function save(message) {
  if (window.qualityCalendarShared) {
    window.qualityCalendarShared.save(state,message);
    return;
  }
  try { localStorage.setItem(storageKey,JSON.stringify(state)); }
  catch { message=`${message || ''} 이 화면을 닫으면 변경사항이 사라집니다.`.trim(); }
  if (message) notify(message);
}

function make(tag, label, className) {
  const node=document.createElement(tag);
  if (label!==undefined) node.textContent=label;
  if (className) node.className=className;
  return node;
}

function button(label, className, callback, ariaLabel) {
  const node=make('button',label,className);
  node.type='button';
  if (ariaLabel) node.setAttribute('aria-label',ariaLabel);
  node.addEventListener('click',callback);
  return node;
}

function pastelColor(value) {
  if (Object.hasOwn(memberTints,value)) return value;
  if (!/^#[\da-f]{6}$/i.test(value)) return seedMembers[0].color;
  const channels=value.slice(1).match(/../g).map(channel=>parseInt(channel,16));
  if (channels.every(channel=>channel>=235)) return value;
  return `#${channels.map(channel=>Math.round(255*.92+channel*.08).toString(16)).join('')}`;
}

function fillColorSelect(select, color) {
  const tint=pastelColor(color);
  const choices=Object.entries(memberTints);
  if (!Object.hasOwn(memberTints,tint)) choices.unshift([tint,'기존 색']);
  select.replaceChildren(...choices.map(([value,label])=>{
    const option=new Option(label,value);
    option.style.backgroundColor=value;
    return option;
  }));
  select.value=tint;
  select.style.setProperty('--tint',tint);
}

function entryLabel(entry) {
  const title=entry.type==='custom' ? entry.detail || kinds.custom[0] : entry.type;
  const flight=entry.type==='WE' ? entry.detail : '';
  return [title,flight,entry.note].filter(Boolean).join(' ');
}

function redraw() {
  const visible=state.members.filter(member=>member.visible);
  const year=currentMonth.getUTCFullYear();
  const month=currentMonth.getUTCMonth();
  const first=utc(year,month,1);
  const length=utc(year,month+1,0).getUTCDate();
  const weeks=Math.ceil((first.getUTCDay()+length)/7);
  const nameLength=Math.min(10,Math.max(5,...visible.map(member=>Array.from(member.name).length)));
  const grid=$('grid');
  grid.style.setProperty('--name-width',`calc(${nameLength*.875}rem + 16px)`);
  grid.style.setProperty('--table-min',`calc(${nameLength*.875+34}rem + 16px)`);
  const entries=new Map();
  for (const entry of state.entries) {
    const key=`${entry.member}/${entry.date}`;
    if (!entries.has(key)) entries.set(key,[]);
    entries.get(key).push(entry);
  }
  const colGroup=make('colgroup');
  colGroup.append(make('col',undefined,'name-col'),...weekdayNames.map(()=>make('col')));
  const thead=make('thead');
  const dayHead=make('tr',undefined,'weekday');
  const teamHeader=make('th');
  const manage=readOnly ? make('span','팀원 관리','manage-button') : button('팀원 관리','manage-button',()=>{
    closePopup();
    renderMembers();
    $('members').showModal();
  });
  teamHeader.append(manage);
  dayHead.append(teamHeader);
  weekdayNames.forEach((name,index)=>{
    dayHead.append(make('th',name,index===0?'sunday':index===6?'saturday':''));
  });
  thead.append(dayHead);
  const blocks=[];
  for (let week=0;week<weeks;week++) {
    const body=make('tbody');
    const dateRow=make('tr',undefined,'date-row');
    const blank=make('th');
    const days=weekdayNames.map((_,day)=>utc(year,month,1-first.getUTCDay()+7*week+day));
    dateRow.append(blank);
    for (const day of days) {
      const key=stamp(day);
      const outside=day.getUTCMonth()!==month;
      const th=make('th',undefined,outside?'outside':day.getUTCDay()===0?'sunday':day.getUTCDay()===6?'saturday':'');
      const dateLabel=make('time',day.getUTCDate(),'date-label');
      dateLabel.dateTime=key;
      if (key===todayShown && !outside) {
        th.classList.add('today-cell');
        if (!visible.length) th.classList.add('today-end');
        dateLabel.setAttribute('aria-current','date');
      }
      th.append(dateLabel);
      dateRow.append(th);
    }
    body.append(dateRow);
    for (const [index,member] of visible.entries()) {
      const row=make('tr',undefined,'member-row');
      row.style.setProperty('--person',pastelColor(member.color));
      const name=make('th',member.name);
      name.scope='row';
      row.append(name);
      for (const day of days) {
        const key=stamp(day);
        const outside=day.getUTCMonth()!==month;
        const cell=make('td',undefined,outside?'outside':'');
        if (key===todayShown && !outside) {
          cell.classList.add('today-cell');
          if (index===visible.length-1) cell.classList.add('today-end');
        }
        const slot=make('div',undefined,'slot');
        const cellEntries=entries.get(`${member.id}/${key}`) || [];
        slot.classList.toggle('two-entries',cellEntries.length===dailyLimit);
        if (!outside) {
          cell.dataset.entryDate=key;
          cell.dataset.memberId=member.id;
          const open=(entry,trigger)=>openPopup(member.id,key,cell,entry,trigger);
          if (!readOnly) cell.addEventListener('click',event=>{
            if (event.target.closest('button')) return;
            open(cellEntries[0],slot.querySelector('button'));
          });
          for (const entry of cellEntries) {
            const label=entryLabel(entry);
            const chip=readOnly ? make('span',label,'chip') : button(label,'chip',()=>open(entry,chip),`${member.name} ${displayDate.format(day)} ${label}`);
            chip.dataset.entryId=entry.id;
            chip.title=label;
            chip.style.setProperty('--kind',(kinds[entry.type] ?? legacyKinds[entry.type] ?? kinds.custom)[1]);
            slot.append(chip);
          }
          if (!readOnly && !cellEntries.length) {
            const openCell=button('','cell-open',()=>open(undefined,openCell),`${member.name} ${displayDate.format(day)} 일정 입력`);
            slot.append(openCell);
          }
        }
        cell.append(slot);
        row.append(cell);
      }
      body.append(row);
    }
    blocks.push(body);
  }
  $('month').textContent=`${year}년 ${month+1}월`;
  grid.replaceChildren(colGroup,thead,...blocks);
  $('empty').hidden=visible.length>0;
}

function closePopup(restore=false) {
  if (!active) return;
  const {cell,trigger}=active;
  cell.classList.remove('cell-active');
  $('popup').hidden=true;
  active=null;
  if (restore) trigger?.focus({preventScroll:true});
}

function placePopup() {
  if (!active) return;
  const popup=$('popup');
  const bounds=active.cell.getBoundingClientRect();
  const scroll=$('scroll').getBoundingClientRect();
  const frozen=scroll.left+$('grid').rows[0].cells[0].getBoundingClientRect().width;
  const visibleLeft=Math.max(bounds.left,frozen,0);
  const visibleRight=Math.min(bounds.right,scroll.right,window.innerWidth);
  if (visibleRight-visibleLeft<8 || bounds.bottom<0 || bounds.top>window.innerHeight) {
    closePopup();
    return;
  }
  const padding=10;
  const height=popup.offsetHeight;
  const x=Math.max(padding,Math.min(visibleLeft+5,window.innerWidth-popup.offsetWidth-padding));
  const above=bounds.bottom+height+padding+6>window.innerHeight && bounds.top>height+padding;
  const y=above ? bounds.top-height-7 : bounds.bottom+7;
  popup.classList.toggle('above',above);
  popup.style.left=`${x}px`;
  popup.style.top=`${Math.max(padding,Math.min(y,window.innerHeight-height-padding))}px`;
  popup.style.setProperty('--pointer',`${Math.max(14,Math.min((visibleLeft+visibleRight)/2-x-5,popup.offsetWidth-26))}px`);
}

function syncDetail() {
  const type=$('type').value;
  $('detail-field').hidden=!type;
  $('detail-label').textContent=type==='WE'?'편명 (선택)':type==='custom'?'일정 이름 (선택)':'추가 내용 (선택)';
  $('detail').placeholder=type==='WE'?'예시 531A':type==='custom'?'예시 워크숍':'예시 오전 교육';
  placePopup();
}

function openPopup(member,date,cell,entry,trigger) {
  if (readOnly) return;
  closePopup();
  active={member,date,cell,id:entry?.id,trigger};
  cell.classList.add('cell-active');
  $('popup-title').textContent=`${memberById(member).name} · ${displayDate.format(dateObject(date))}`;
  const selectedType=entry?.type ?? '';
  const options=Object.entries(kinds).map(([type,[label]])=>new Option(label,type));
  if (Object.hasOwn(legacyKinds,selectedType)) options.push(new Option(legacyKinds[selectedType][0],selectedType));
  const placeholder=new Option('종류 선택','');
  placeholder.disabled=Boolean(entry);
  $('type').replaceChildren(placeholder,...options);
  $('type').value=selectedType;
  $('detail').value=entry?.detail || entry?.note || '';
  $('delete-event').hidden=!entry;
  $('another-event').hidden=!entry || hasDailyLimit(member,date);
  $('popup').hidden=false;
  syncDetail();
  if (active) $('type').focus({preventScroll:true});
}

function changeMonth(offset) {
  closePopup();
  currentMonth=offset===null ? dateObject(today()) : utc(currentMonth.getUTCFullYear(),currentMonth.getUTCMonth()+offset,1);
  todayShown=today();
  redraw();
  if (offset===null) {
    const header=$('grid').querySelector('[aria-current="date"]');
    if (header) header.scrollIntoView({block:'nearest',inline:'center'});
  }
}

function refreshMembers() {
  closePopup();
  redraw();
  renderMembers();
}

function renderMembers() {
  const rows=state.members.map((member,index)=>{
    const row=make('div',undefined,'member-edit');
    const check=make('input');
    check.type='checkbox';
    check.checked=member.visible;
    check.setAttribute('aria-label',`${member.name} 일정 표시`);
    check.addEventListener('change',()=>{
      member.visible=check.checked;
      save();
      closePopup();
      redraw();
    });
    const color=make('select',undefined,'tint-select');
    fillColorSelect(color,member.color);
    color.setAttribute('aria-label',`${member.name} 행 배경색`);
    color.addEventListener('change',()=>{
      member.color=color.value;
      color.style.setProperty('--tint',member.color);
      save();
      redraw();
    });
    const identity=make('div',undefined,'member-identity');
    const nameInput=make('input',undefined,'member-name-input');
    nameInput.type='text';
    nameInput.maxLength=22;
    nameInput.value=member.name;
    nameInput.setAttribute('aria-label',`${member.name} 이름 수정`);
    const commitName=()=>{
      const name=nameInput.value.trim();
      if (!name || state.members.some(item=>item.id!==member.id && item.name===name)) {
        nameInput.setCustomValidity(name?'이미 등록된 이름입니다.':'팀원 이름을 입력해 주세요.');
        nameInput.reportValidity();
        return;
      }
      if (name===member.name) {
        nameInput.value=name;
        return;
      }
      member.name=name;
      save('팀원 이름을 수정했습니다.');
      refreshMembers();
    };
    nameInput.addEventListener('input',()=>nameInput.setCustomValidity(''));
    nameInput.addEventListener('keydown',event=>{
      if (event.key!=='Enter' || event.isComposing) return;
      event.preventDefault();
      commitName();
    });
    identity.append(nameInput,button('수정','button',commitName,`${member.name} 이름 저장`));
    const move=offset=>{
      const next=index+offset;
      [state.members[index],state.members[next]]=[state.members[next],state.members[index]];
      save();
      refreshMembers();
    };
    const up=button('↑','button',()=>move(-1),`${member.name} 위로 이동`);
    up.disabled=index===0;
    const down=button('↓','button',()=>move(1),`${member.name} 아래로 이동`);
    down.disabled=index===state.members.length-1;
    const remove=button('제거','button danger',()=>{
      if (!window.confirm(`${member.name} 님과 등록된 일정을 함께 제거할까요?`)) return;
      state.members=state.members.filter(item=>item.id!==member.id);
      state.entries=state.entries.filter(entry=>entry.member!==member.id);
      save('팀원을 제거했습니다.');
      refreshMembers();
    },`${member.name} 제거`);
    row.append(check,identity,color,up,down,remove);
    return row;
  });
  $('member-rows').replaceChildren(...rows);
}

function hasDailyLimit(member,date) {
  return state.entries.filter(entry=>entry.member===member && entry.date===date).length>=dailyLimit;
}

$('type').addEventListener('change',()=>{
  const type=$('type').value;
  const index=state.entries.findIndex(entry=>entry.id===active?.id);
  const existing=state.entries[index];
  if (existing && Object.hasOwn(kinds,type) && existing.type!==type) {
    const {id,member,date}=existing;
    state.entries[index]={...existing,type,detail:'',note:''};
    $('detail').value='';
    active.cell.classList.remove('cell-active');
    redraw();
    active.cell=findCell(member,date);
    active.cell.classList.add('cell-active');
    active.trigger=active.cell.querySelector(`[data-entry-id="${CSS.escape(id)}"]`);
    save('일정을 변경했습니다.');
  }
  syncDetail();
});
$('event-form').addEventListener('submit',event=>{
  event.preventDefault();
  if (!active) return;
  const type=$('type').value;
  if (!Object.hasOwn(kinds,type) && !Object.hasOwn(legacyKinds,type)) return;
  const extra=$('detail').value.trim();
  const flight=extra.match(/^(?:WE\s*)?(\d+[a-z]?)$/i);
  const detail=type==='WE' ? flight?.[1].toUpperCase() ?? extra : type==='custom' ? extra : '';
  const note=type==='WE' || type==='custom' ? '' : extra;
  const {id=newId(),member,date}=active;
  const entry={id,member,date,type,detail,note};
  const index=state.entries.findIndex(item=>item.id===id);
  if (index<0 && hasDailyLimit(member,date)) {
    notify('한 사람의 하루 일정은 두 개까지 등록할 수 있습니다.');
    return;
  }
  if (index<0) state.entries.push(entry);
  else state.entries[index]=entry;
  closePopup();
  save('일정을 저장했습니다.');
  redraw();
  focusCell(member,date);
});
function findCell(member,date) {
  return $('grid').querySelector(`[data-entry-date="${date}"][data-member-id="${CSS.escape(member)}"]`);
}
function focusCell(member,date) {
  findCell(member,date)?.querySelector('button')?.focus({preventScroll:true});
}
$('another-event').addEventListener('click',()=>{
  if (!active) return;
  const {member,date,cell,trigger}=active;
  if (hasDailyLimit(member,date)) return;
  openPopup(member,date,cell,undefined,trigger);
});
$('delete-event').addEventListener('click',()=>{
  if (!active?.id) return;
  const {id,member,date}=active;
  state.entries=state.entries.filter(entry=>entry.id!==id);
  closePopup();
  save('일정을 삭제했습니다.');
  redraw();
  focusCell(member,date);
});
$('member-name').addEventListener('input',()=> $('member-name').setCustomValidity(''));
fillColorSelect($('member-color'),seedMembers[0].color);
$('member-color').addEventListener('change',()=> $('member-color').style.setProperty('--tint',$('member-color').value));
$('member-form').addEventListener('submit',event=>{
  event.preventDefault();
  const input=$('member-name');
  const name=input.value.trim();
  if (!name || state.members.some(member=>member.name===name)) {
    input.setCustomValidity(name?'이미 등록된 이름입니다.':'팀원 이름을 입력해 주세요.');
    input.reportValidity();
    return;
  }
  state.members.push({id:newId(),name,color:$('member-color').value,visible:true});
  input.value='';
  save('팀원을 추가했습니다.');
  refreshMembers();
  input.focus();
});
$('close-members').addEventListener('click',()=> $('members').close());
$('close-popup').addEventListener('click',()=>closePopup(true));
$('today').addEventListener('click',()=>changeMonth(null));
$('prev').addEventListener('click',()=>changeMonth(-1));
$('next').addEventListener('click',()=>changeMonth(1));
$('view-mode').addEventListener('click',()=>setMode(true));
$('edit-mode').addEventListener('click',()=>setMode(false));
document.addEventListener('keydown',event=>{ if (active && event.key==='Escape') closePopup(true); });
document.addEventListener('pointerdown',event=>{
  if (active && !$('popup').contains(event.target) && !active.cell.contains(event.target)) closePopup();
});
window.addEventListener('resize',placePopup);
document.addEventListener('scroll',placePopup,true);
document.addEventListener('visibilitychange',updateToday);
setInterval(updateToday,30000);

function updateToday() {
  const value=today();
  if (value===todayShown) return;
  todayShown=value;
  closePopup();
  redraw();
}

function setMode(next) {
  if (next) {
    closePopup();
    if ($('members').open) $('members').close();
  }
  readOnly=next;
  $('calendar').classList.toggle('read-only',next);
  $('view-mode').setAttribute('aria-pressed',String(next));
  $('edit-mode').setAttribute('aria-pressed',String(!next));
  redraw();
}

setMode(readOnly);

window.qualityCalendar = {
  replaceSharedState(next) {
    closePopup();
    state=next;
    redraw();
    if ($('members').open) renderMembers();
  },
  hasOpenEditor() { return Boolean(active || $('members').open); },
  notice: notify,
};
