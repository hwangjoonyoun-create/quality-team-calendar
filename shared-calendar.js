'use strict';

const calendarBridge = window.qualityCalendar;
const byId = id => document.getElementById(id);
const mainPage = byId('calendar-page');
const connectPanel = byId('connect-panel');
const connectionStatus = byId('connect-status');
const retry = byId('connect-retry');

let client;
let revision;
let confirmed;
let saving = false;
let reading = false;
let generation = 0;

function lockCalendar(locked) {
  mainPage.inert = locked;
  byId('members').inert = locked;
  byId('popup').inert = locked;
}

function showConnection(message, canRetry = false) {
  connectionStatus.textContent = message;
  connectPanel.hidden = false;
  retry.hidden = !canRetry;
}

function showCalendar(row) {
  confirmed = structuredClone(row.data);
  revision = row.revision;
  calendarBridge.replaceSharedState(row.data);
  mainPage.hidden = false;
  connectPanel.hidden = true;
}

async function fetchCalendar() {
  const {data,error} = await client.from('quality_calendar').select('data,revision').eq('id',1).single();
  if (error) throw error;
  return data;
}

async function syncCalendar() {
  if (!client || saving || reading || calendarBridge.hasOpenEditor()) return;
  const requestGeneration = generation;
  reading = true;
  retry.disabled = true;
  try {
    const row = await fetchCalendar();
    if (generation === requestGeneration && !calendarBridge.hasOpenEditor() && row.revision !== revision) {
      showCalendar(row);
    }
  } catch {
    if (revision === undefined) showConnection('공동 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',true);
  } finally {
    reading = false;
    retry.disabled = false;
  }
}

window.qualityCalendarShared = {
  async save(next, message) {
    if (saving || revision === undefined) return;
    saving = true;
    const snapshot = structuredClone(next);
    ++generation;
    lockCalendar(true);
    try {
      const {data,error} = await client.rpc('save_quality_calendar', {
        expected_revision:revision,
        next_data:snapshot,
      });
      if (error) throw error;
      if (data === null) {
        showCalendar(await fetchCalendar());
        calendarBridge.notice('다른 사람이 먼저 저장했습니다. 최신 일정에서 변경을 다시 입력해 주세요.');
        return;
      }
      revision = data;
      confirmed = snapshot;
      if (message) calendarBridge.notice(message);
    } catch {
      calendarBridge.replaceSharedState(structuredClone(confirmed));
      calendarBridge.notice('저장에 실패했습니다. 마지막으로 확인된 일정을 표시합니다.');
    } finally {
      saving = false;
      lockCalendar(false);
    }
  },
};

function start() {
  const config = window.qualitySupabaseConfig;
  let projectUrl;
  try { projectUrl = new URL(config?.url ?? ''); } catch {}
  if (projectUrl?.protocol !== 'https:' || !config?.publishableKey?.startsWith('sb_publishable_')) {
    showConnection('공동 일정 연결 설정이 필요합니다.');
    return;
  }
  if (!window.supabase?.createClient) {
    showConnection('연결 구성 요소를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    return;
  }
  client = window.supabase.createClient(projectUrl.origin,config.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  retry.addEventListener('click',syncCalendar);
  syncCalendar();
  setInterval(()=>{ if (!document.hidden) syncCalendar(); },15000);
  document.addEventListener('visibilitychange',()=>{ if (!document.hidden) syncCalendar(); });
}

start();
