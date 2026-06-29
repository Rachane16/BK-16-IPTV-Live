const channels = Array.isArray(window.BK16_CHANNELS) ? window.BK16_CHANNELS : [];
const $ = (selector) => document.querySelector(selector);

const video = $('#v');
const grid = $('#grid-sports');
const statusBox = $('#status');
const featuredLogo = $('#featuredLogo');
const featuredName = $('#featuredName');
const channelCount = $('#channelCount');
const lastUpdated = $('#lastUpdated');
const playerPlaceholder = $('#playerPlaceholder');

const playerModal = $('#playerModal');
const modalLogo = $('#modalLogo');
const modalName = $('#modalName');
const modalNote = $('#modalNote');
const closeModal = $('#closeModal');
const nonIosButtons = $('#nonIosButtons');
const iosButtons = $('#iosButtons');
const btnMobilePlayer = $('#btnMobilePlayer');
const btnOpenTab = $('#btnOpenTab');
const btnIOSTab = $('#btnIOSTab');
const btnVLC = $('#btnVLC');
const btnLiftplay = $('#btnLiftplay');
const btnInfuse = $('#btnInfuse');
const btnNPlayer = $('#btnNPlayer');

let hls = null;
let selectedChannel = null;
let activeKey = null;
let requestToken = 0;
let fallbackTimer = null;

const CATEGORY_META = {
  digital:{
    title:'ทีวีดิจิตอลไทย',
    description:'ช่อง HLS เล่นได้บนเว็บไซต์ ส่วนช่อง DASH/DRM จะแสดงคำแนะนำสำหรับการรับชมอย่างถูกต้อง'
  },
  sports:{
    title:'ช่องกีฬาและรายการพิเศษ',
    description:'รวมช่องกีฬา รายการพิเศษ และสตรีมที่รองรับ HLS หรือ Player ภายนอก'
  }
};
const CATEGORY_ORDER = ['digital','sports'];

const isAndroid = () => /Android/i.test(navigator.userAgent);
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isDesktop = () => !isAndroid() && !isIOS();
const isHls = (url='') => /\.m3u8(?:$|\?)/i.test(url);
const isDash = (channel={}) => channel.type === 'dash' || /\.mpd(?:$|\?)/i.test(channel.url || '');

function escapeHtml(value='') {
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function setStatus(message,type='normal') {
  statusBox.textContent = message;
  statusBox.classList.toggle('ok',type === 'ok');
  statusBox.classList.toggle('bad',type === 'bad');
}

function setNowPlaying(channel) {
  selectedChannel = channel;
  featuredLogo.src = channel.logo || '';
  featuredLogo.alt = channel.name || '';
  featuredName.textContent = channel.name || 'IPTV by BK-16';
}

function setActive(key) {
  activeKey = key;
  document.querySelectorAll('.channel-card').forEach(card => {
    card.classList.toggle('active',card.dataset.key === key);
  });
}

function clearFallbackTimer() {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
}

function stopStream() {
  clearFallbackTimer();
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function openExternal(channel) {
  if (!channel?.url) return;
  const opened = window.open(channel.url,'_blank','noopener,noreferrer');
  setStatus(opened ? `เปิด ${channel.name} ในแท็บใหม่แล้ว` : 'เบราว์เซอร์บล็อกการเปิดหน้าต่างใหม่',opened ? 'ok' : 'bad');
}

function androidIntent(url) {
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.replace(':','');
    return `intent://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}` +
      `#Intent;scheme=${scheme};action=android.intent.action.VIEW;` +
      `category=android.intent.category.BROWSABLE;type=application/vnd.apple.mpegurl;` +
      `S.browser_fallback_url=${encodeURIComponent(url)};end`;
  } catch {
    return url;
  }
}

function closePlayerModal() {
  playerModal.classList.remove('show');
  playerModal.setAttribute('aria-hidden','true');
}

function openPlayerModal(channel,reason='',noticeOnly=false) {
  selectedChannel = channel;
  modalLogo.src = channel.logo || '';
  modalLogo.alt = channel.name || '';
  modalName.textContent = channel.name || 'External Player';

  if (noticeOnly) {
    nonIosButtons.hidden = true;
    iosButtons.hidden = true;
    modalNote.textContent = reason;
  } else if (isIOS()) {
    nonIosButtons.hidden = true;
    iosButtons.hidden = false;
    modalNote.textContent = 'ช่องนี้ไม่สามารถเล่นภายในหน้าเว็บได้ กรุณาเลือกแอป Player ที่ติดตั้งในเครื่อง';
  } else {
    nonIosButtons.hidden = false;
    iosButtons.hidden = true;
    modalNote.textContent = isAndroid()
      ? 'กรุณาเปิดช่องนี้ด้วยแอป Player บน Android'
      : 'กรุณาเลือกวิธีเปิดช่องนี้จากตัวเลือกด้านล่าง';
  }

  playerModal.classList.add('show');
  playerModal.setAttribute('aria-hidden','false');
  setStatus(reason ? reason : 'กรุณาเปิดด้วย Player ภายนอก',noticeOnly ? 'normal' : 'bad');
}

function showRestrictedNotice(channel,key) {
  requestToken += 1;
  stopStream();
  setNowPlaying(channel);
  setActive(key);
  playerPlaceholder.classList.remove('hidden');

  const message = channel.notice ||
    'ช่องนี้ใช้รูปแบบ DASH/DRM และต้องรับชมผ่านเครื่องเล่น บัญชี หรือสิทธิ์ที่ได้รับอนุญาตจากผู้ให้บริการ ระบบจะไม่เก็บหรือฝังคีย์ DRM ไว้ในเว็บไซต์สาธารณะ';

  openPlayerModal(channel,message,true);
}

function useFallback(channel,token,reason='') {
  if (token !== requestToken) return;
  stopStream();
  playerPlaceholder.classList.remove('hidden');
  if (isDesktop()) openExternal(channel);
  else openPlayerModal(channel,reason,false);
}

function playChannel(channel,key) {
  if (channel.type === 'notice' || !channel.url) {
    showRestrictedNotice(channel,key);
    return;
  }

  if (isDash(channel)) {
    showRestrictedNotice(channel,key);
    return;
  }

  requestToken += 1;
  const token = requestToken;

  closePlayerModal();
  stopStream();
  setNowPlaying(channel);
  setActive(key);
  playerPlaceholder.classList.add('hidden');
  setStatus(`กำลังเตรียมสัญญาณ ${channel.name}...`);

  if (String(channel.url).startsWith('http://')) {
    useFallback(channel,token,'ลิงก์ HTTP ถูกบล็อกบนเว็บไซต์ HTTPS');
    return;
  }

  if (!isHls(channel.url)) {
    useFallback(channel,token,'ลิงก์นี้ไม่ใช่ HLS stream');
    return;
  }

  fallbackTimer = setTimeout(() => {
    const isPlaying = !video.paused && !video.ended && video.readyState >= 2;
    if (!isPlaying) useFallback(channel,token,'โหลดสัญญาณนานเกินไป');
  },9000);

  video.addEventListener('playing',() => {
    if (token !== requestToken) return;
    clearFallbackTimer();
    playerPlaceholder.classList.add('hidden');
    setStatus(`กำลังเล่น ${channel.name}`,'ok');
  },{once:true});

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = channel.url;
    video.play().catch(error => useFallback(channel,token,error.message));
    return;
  }

  if (window.Hls?.isSupported()) {
    hls = new Hls({enableWorker:true,lowLatencyMode:true,maxBufferLength:30});
    hls.loadSource(channel.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED,() => {
      video.play().catch(error => useFallback(channel,token,error.message));
    });
    hls.on(Hls.Events.ERROR,(_event,data) => {
      if (data.fatal) useFallback(channel,token,data.details || 'HLS error');
    });
    return;
  }

  useFallback(channel,token,'เบราว์เซอร์นี้ไม่รองรับ HLS');
}

function streamMeta(channel={}) {
  if (channel.type === 'notice' || !channel.url) {
    return {badge:'ข้อมูล',badgeClass:'notice',label:'ต้องใช้ลิงก์สาธารณะที่เหมาะสม',cardClass:'is-notice'};
  }
  if (isDash(channel)) {
    return {badge:'DASH',badgeClass:'dash',label:'DASH / DRM ต้องมีสิทธิ์รับชม',cardClass:'is-dash'};
  }
  if (isHls(channel.url)) {
    return {badge:'ON AIR',badgeClass:'hls',label:'HLS เล่นบนเว็บ',cardClass:'is-hls'};
  }
  return {badge:'PLAYER',badgeClass:'external',label:'เปิดด้วย Player ภายนอก',cardClass:'is-external'};
}

function createChannelCard(channel,index) {
  const key = `${channel.id || 'channel'}-${index}`;
  const meta = streamMeta(channel);
  const card = document.createElement('article');
  card.className = `channel-card ${meta.cardClass}`;
  card.dataset.key = key;
  card.tabIndex = 0;
  card.setAttribute('role','button');
  card.setAttribute('aria-label',`เลือก ${channel.name}`);
  card.innerHTML = `
    <span class="stream-badge ${meta.badgeClass}">${escapeHtml(meta.badge)}</span>
    <div class="logo-box">
      <img loading="lazy" src="${escapeHtml(channel.logo)}" alt="${escapeHtml(channel.name)}">
    </div>
    <div class="channel-meta">
      <div class="channel-name">${escapeHtml(channel.name)}</div>
      <div class="channel-type">${escapeHtml(meta.label)}</div>
    </div>`;

  const choose = () => {
    playChannel(channel,key);
    requestAnimationFrame(() => {
      document.querySelector('.hero')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  };

  card.addEventListener('click',choose);
  card.addEventListener('keydown',event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose();
    }
  });
  return card;
}

function renderChannels() {
  grid.innerHTML = '';
  channelCount.textContent = `${channels.length} ช่อง`;

  if (!channels.length) {
    grid.innerHTML = '<div class="empty">ยังไม่มีรายการช่องในระบบ</div>';
    return;
  }

  const grouped = new Map();
  channels.forEach((channel,index) => {
    const category = channel.category || 'sports';
    if (!grouped.has(category)) grouped.set(category,[]);
    grouped.get(category).push({channel,index});
  });

  const categories = [...grouped.keys()].sort((a,b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  categories.forEach(category => {
    const items = grouped.get(category);
    const meta = CATEGORY_META[category] || {
      title:category,
      description:'รายการช่องในหมวดนี้'
    };

    const group = document.createElement('section');
    group.className = 'channel-group';
    group.innerHTML = `
      <div class="channel-group-head">
        <div class="channel-group-copy">
          <h3>${escapeHtml(meta.title)}</h3>
          <p>${escapeHtml(meta.description)}</p>
        </div>
        <span class="channel-group-count">${items.length} ช่อง</span>
      </div>
      <div class="channel-group-grid"></div>`;

    const groupGrid = group.querySelector('.channel-group-grid');
    items.forEach(({channel,index}) => {
      groupGrid.appendChild(createChannelCard(channel,index));
    });
    grid.appendChild(group);
  });

  if (activeKey) setActive(activeKey);
}

closeModal.addEventListener('click',closePlayerModal);
playerModal.addEventListener('click',event => {
  if (event.target === playerModal) closePlayerModal();
});
document.addEventListener('keydown',event => {
  if (event.key === 'Escape') closePlayerModal();
});

btnMobilePlayer.addEventListener('click',() => {
  if (!selectedChannel?.url) return;
  if (isAndroid()) window.location.href = androidIntent(selectedChannel.url);
  else openExternal(selectedChannel);
});
btnOpenTab.addEventListener('click',() => openExternal(selectedChannel));
btnIOSTab.addEventListener('click',() => openExternal(selectedChannel));
btnVLC.addEventListener('click',() => selectedChannel?.url && (window.location.href = `vlc://${selectedChannel.url}`));
btnLiftplay.addEventListener('click',() => selectedChannel?.url && (window.location.href = `liftplay://${selectedChannel.url}`));
btnInfuse.addEventListener('click',() => selectedChannel?.url && (window.location.href = `infuse://x-callback-url/play?url=${encodeURIComponent(selectedChannel.url)}`));
btnNPlayer.addEventListener('click',() => {
  if (!selectedChannel?.url) return;
  window.location.href = selectedChannel.url
    .replace(/^https:\/\//i,'nplayer-https://')
    .replace(/^http:\/\//i,'nplayer-http://');
});

function init() {
  renderChannels();
  const now = new Date();
  lastUpdated.textContent = `${now.getFullYear()}:${String(now.getMonth()+1).padStart(2,'0')}:${String(now.getDate()).padStart(2,'0')}`;
}

init();
