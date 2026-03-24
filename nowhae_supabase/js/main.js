/* ============================================
   NOWHAE — main.js v2.0
   구글 로그인 + 마이페이지 + 스트릭
   ============================================ */

const SUPABASE_URL = 'https://wovjiqcjdcvwhymdipsk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvdmppcWNqZGN2d2h5bWRpcHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTc4MjAsImV4cCI6MjA4OTc5MzgyMH0.zjXucQPF-KKe2nj5RmpFzeE6VDagbHeLNRcY2fenbzo';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Prefer': 'return=representation',
};
const API = SUPABASE_URL + '/rest/v1/posts';

/* ─── 상태 ─── */
let allPosts = [];
let filteredPosts = [];
let currentPage = 1;
const PAGE_SIZE = 9;
let currentCat = '전체';
let currentSort = 'newest';
let searchQuery = '';
let selectedCategory = '습관';
let likedIds = new Set(JSON.parse(localStorage.getItem('nowhae_liked') || '[]'));
let uploadedImageBase64 = '';
let currentUser = null;
let currentTab = 'all'; // 'all' | 'my'

/* ─── DOM ─── */
const feedGrid       = document.getElementById('feedGrid');
const emptyState     = document.getElementById('emptyState');
const loadMoreBtn    = document.getElementById('loadMoreBtn');
const modalOverlay   = document.getElementById('modalOverlay');
const openModalBtn   = document.getElementById('openModalBtn');
const closeModalBtn  = document.getElementById('closeModalBtn');
const cancelBtn      = document.getElementById('cancelBtn');
const writeForm      = document.getElementById('writeForm');
const toast          = document.getElementById('toast');
const searchInput    = document.getElementById('searchInput');
const totalPostsEl   = document.getElementById('totalPosts');
const totalLikesEl   = document.getElementById('totalLikes');
const totalDaysEl    = document.getElementById('totalDays');
const charCountEl    = document.getElementById('charCount');
const fContent       = document.getElementById('fContent');
const uploadZone     = document.getElementById('uploadZone');
const fImageFile     = document.getElementById('fImageFile');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const uploadPreview  = document.getElementById('uploadPreview');
const previewImg     = document.getElementById('previewImg');
const uploadRemove   = document.getElementById('uploadRemove');
const uploadFilename = document.getElementById('uploadFilename');
const uploadProgress = document.getElementById('uploadProgress');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const btnLogin       = document.getElementById('btnLogin');
const btnLogout      = document.getElementById('btnLogout');
const userMenu       = document.getElementById('userMenu');
const userAvatar     = document.getElementById('userAvatar');
const userName       = document.getElementById('userName');
const btnMypage      = document.getElementById('btnMypage');
const tabAll         = document.getElementById('tabAll');
const tabMy          = document.getElementById('tabMy');
const mypageSection  = document.getElementById('mypageSection');
const filterBar      = document.getElementById('filterBar');

/* ============================================
   INIT
   ============================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // 로그인 상태 확인
  const { data: { session } } = await sb.auth.getSession();
  if (session) setUser(session.user);
  else showLoginBtn();

  // 인증 상태 변화 감지
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) setUser(session.user);
    else { currentUser = null; showLoginBtn(); }
  });

  await loadPosts();
  bindEvents();
  bindImageUpload();
});

/* ─── 로그인 상태 UI ─── */
function setUser(user) {
  currentUser = user;
  const avatar = user.user_metadata?.avatar_url || '';
  const name = user.user_metadata?.full_name || user.email;
  userAvatar.src = avatar;
  userName.textContent = name.split(' ')[0];
  document.getElementById('mypageAvatar').src = avatar;
  document.getElementById('mypageName').textContent = name;
  document.getElementById('mypageEmail').textContent = user.email;
  btnLogin.classList.add('hidden');
  userMenu.classList.remove('hidden');

  // 닉네임 자동 입력
  const fNickname = document.getElementById('fNickname');
  if (fNickname && !fNickname.value) fNickname.value = name.split(' ')[0];
}

function showLoginBtn() {
  btnLogin.classList.remove('hidden');
  userMenu.classList.add('hidden');
}

/* ============================================
   LOAD POSTS
   ============================================ */
async function loadPosts() {
  showSkeletons();
  try {
    const res = await fetch(`${API}?select=*&order=created_at.desc&limit=200`, { headers: HEADERS });
    const json = await res.json();
    allPosts = Array.isArray(json) ? json : [];
    applyFilterAndRender();
    updateStats();
  } catch (e) {
    showToast('데이터를 불러오지 못했어요 😢');
    feedGrid.innerHTML = '';
  }
}

function updateStats() {
  totalPostsEl.textContent = allPosts.length.toLocaleString();
  const totalLikes = allPosts.reduce((acc, p) => acc + (p.likes || 0), 0);
  totalLikesEl.textContent = totalLikes.toLocaleString();
  const maxDay = allPosts.reduce((acc, p) => Math.max(acc, p.day_count || 0), 0);
  totalDaysEl.textContent = maxDay > 0 ? maxDay + '일' : '—';
}

/* ============================================
   탭 전환
   ============================================ */
function switchTab(tab) {
  currentTab = tab;
  tabAll.classList.toggle('active', tab === 'all');
  tabMy.classList.toggle('active', tab === 'my');

  if (tab === 'my') {
    if (!currentUser) { showToast('로그인 후 이용할 수 있어요!'); switchTab('all'); return; }
    mypageSection.classList.remove('hidden');
    filterBar.classList.add('hidden');
    renderMypage();
  } else {
    mypageSection.classList.add('hidden');
    filterBar.classList.remove('hidden');
  }
  applyFilterAndRender();
}

/* ============================================
   마이페이지
   ============================================ */
function renderMypage() {
  if (!currentUser) return;
  const myPosts = allPosts.filter(p => p.user_id === currentUser.id);

  // 통계
  document.getElementById('myTotalPosts').textContent = myPosts.length;
  document.getElementById('myTotalLikes').textContent = myPosts.reduce((a, p) => a + (p.likes || 0), 0);

  // 연속 스트릭 계산
  const { streak, maxStreak } = calcStreak(myPosts);
  document.getElementById('myStreak').textContent = streak + '일';
  document.getElementById('myMaxStreak').textContent = maxStreak + '일';

  // 잔디 달력
  renderStreakCalendar(myPosts);
}

function calcStreak(posts) {
  if (!posts.length) return { streak: 0, maxStreak: 0 };

  const dateSet = new Set(posts.map(p => {
    const d = new Date(p.created_at);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));

  let streak = 0, maxStreak = 0, cur = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dateSet.has(key)) {
      cur++;
      if (i === 0 || i === streak) streak = cur;
    } else {
      if (i <= streak) streak = cur;
      maxStreak = Math.max(maxStreak, cur);
      cur = 0;
    }
  }
  maxStreak = Math.max(maxStreak, cur);
  return { streak, maxStreak };
}

function renderStreakCalendar(posts) {
  const cal = document.getElementById('streakCalendar');
  const dateCount = {};
  posts.forEach(p => {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    dateCount[key] = (dateCount[key] || 0) + 1;
  });

  const today = new Date();
  // 이번 달 1일부터 말일까지 표시
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 시작 요일

  let html = `<div class="cal-month-title">${year}년 ${month+1}월</div>`;
  html += '<div class="cal-grid">';
  ['일','월','화','수','목','금','토'].forEach(d => {
    html += `<div class="cal-day-label">${d}</div>`;
  });

  // 빈 칸 (월 시작 전)
  for (let i = 0; i < startDow; i++) {
    html += `<div class="cal-cell-wrap"><div class="cal-cell level-0 empty"></div></div>`;
  }

  // 날짜 채우기
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(year, month, day);
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const count = dateCount[key] || 0;
    const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
    const isToday = d.toDateString() === today.toDateString() ? 'today' : '';
    // 오늘 기록한 내용 가져오기
    const dayPosts = posts.filter(p => {
      const pd = new Date(p.created_at);
      return pd.getFullYear() === year && pd.getMonth() === month && pd.getDate() === day;
    });
    const tooltip = dayPosts.length > 0
      ? dayPosts.map(p => p.content.substring(0, 20)).join(' / ')
      : (d.toDateString() === today.toDateString() ? '오늘 아직 기록 없음' : '');
    html += '<div class="cal-cell-wrap">' +
      '<div class="cal-cell level-' + level + ' ' + isToday + '" title="' + tooltip.replace(/"/g, "'") + '"></div>' +
      '<div class="cal-date-num ' + isToday + '">' + day + '</div>' +
      '</div>';
  }
  html += '</div>';
  cal.innerHTML = html;

  // 달력 셀 클릭시 기록 내용 팝업
  cal.querySelectorAll('.cal-cell').forEach((cell, i) => {
    cell.addEventListener('click', () => {
      const tip = cell.getAttribute('title');
      if (tip) showToast('📝 ' + tip);
    });
  });
}

/* ============================================
   FILTER / SORT / SEARCH
   ============================================ */
function applyFilterAndRender() {
  let posts = [...allPosts];

  // 내 기록 탭이면 내 것만
  if (currentTab === 'my' && currentUser) {
    posts = posts.filter(p => p.user_id === currentUser.id);
  }

  if (currentCat !== '전체') posts = posts.filter(p => p.category === currentCat);
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    posts = posts.filter(p =>
      (p.content || '').toLowerCase().includes(q) ||
      (p.nickname || '').toLowerCase().includes(q)
    );
  }
  if (currentSort === 'newest') posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else if (currentSort === 'popular') posts.sort((a, b) => (b.likes||0) - (a.likes||0));
  else if (currentSort === 'days') posts.sort((a, b) => (b.day_count||0) - (a.day_count||0));

  filteredPosts = posts;
  currentPage = 1;
  feedGrid.innerHTML = '';
  renderPage();
}

function renderPage() {
  const end = currentPage * PAGE_SIZE;
  const slice = filteredPosts.slice(0, end);
  if (!filteredPosts.length) {
    emptyState.classList.remove('hidden');
    loadMoreBtn.classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  feedGrid.innerHTML = '';
  slice.forEach((post, idx) => feedGrid.appendChild(createCard(post, idx)));
  end < filteredPosts.length ? loadMoreBtn.classList.remove('hidden') : loadMoreBtn.classList.add('hidden');
}

/* ============================================
   CREATE CARD
   ============================================ */
function createCard(post, idx) {
  const card = document.createElement('div');
  card.className = 'feed-card';
  card.style.animationDelay = `${(idx % PAGE_SIZE) * 0.05}s`;

  const avIdx = stringHash(post.nickname || '?') % 8;
  const initial = (post.nickname || '?').charAt(0).toUpperCase();
  const isLiked = likedIds.has(post.id);
  const dateStr = formatDate(post.created_at);
  const catEmoji = getCatEmoji(post.category);
  const isMyPost = currentUser && post.user_id === currentUser.id;

  card.innerHTML = `
    <div class="card-top">
      ${post.user_avatar
        ? `<img src="${post.user_avatar}" class="card-avatar-img" alt="프로필" onerror="this.style.display='none'" />`
        : `<div class="card-avatar av-${avIdx}">${initial}</div>`}
      <div class="card-meta">
        <div class="card-nickname">${escHtml(post.nickname || '익명')} ${isMyPost ? '<span class="my-badge">나</span>' : ''}</div>
        <div class="card-date">${dateStr}</div>
      </div>
      ${post.day_count ? `<div class="card-badge"><i class="fa-solid fa-fire"></i>${post.day_count}일째</div>` : ''}
    </div>
    ${post.category ? `<span class="card-category">${catEmoji} ${escHtml(post.category)}</span>` : ''}
    <p class="card-content">${escHtml(post.content || '')}</p>
    ${post.image_url ? `<img class="card-image" src="${post.image_url}" alt="첨부 이미지" loading="lazy" onerror="this.style.display='none'" />` : ''}
    <div class="card-bottom">
      <span class="card-streak">연속 <strong>${post.day_count || 0}일</strong> 도전 중 🔥</span>
      <button class="btn-like ${isLiked ? 'liked' : ''}" data-id="${post.id}" data-likes="${post.likes || 0}">
        <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart like-icon"></i>
        <span class="like-count">${(post.likes || 0).toLocaleString()}</span>
      </button>
    </div>`;

  card.querySelector('.btn-like').addEventListener('click', handleLike);
  const cardImg = card.querySelector('.card-image');
  if (cardImg) cardImg.addEventListener('click', () => openLightbox(cardImg.src));
  return card;
}

/* ============================================
   LIKE
   ============================================ */
async function handleLike(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  if (!id) return;
  const isLiked = likedIds.has(id);
  const currentLikes = parseInt(btn.dataset.likes, 10) || 0;
  const newLikes = isLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
  btn.dataset.likes = newLikes;
  btn.querySelector('.like-count').textContent = newLikes.toLocaleString();
  if (isLiked) {
    likedIds.delete(id); btn.classList.remove('liked');
    btn.querySelector('i').className = 'fa-regular fa-heart like-icon';
  } else {
    likedIds.add(id); btn.classList.add('liked');
    btn.querySelector('i').className = 'fa-solid fa-heart like-icon';
  }
  saveLiked();
  const post = allPosts.find(p => p.id === id);
  if (post) post.likes = newLikes;
  try {
    await fetch(`${API}?id=eq.${id}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ likes: newLikes }) });
    updateStats();
    if (currentTab === 'my') renderMypage();
  } catch (err) { showToast('응원 저장 중 오류가 발생했어요'); }
}

function saveLiked() { localStorage.setItem('nowhae_liked', JSON.stringify([...likedIds])); }

/* ============================================
   WRITE FORM
   ============================================ */
function openModal() {
  if (!currentUser) { showToast('로그인 후 기록할 수 있어요! 🔒'); return; }
  modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // 연속 도전 일수 자동 계산
  const myPosts = allPosts.filter(p => p.user_id === currentUser.id);
  if (myPosts.length > 0) {
    const { streak } = calcStreak(myPosts);
    // 오늘 이미 기록했으면 streak, 아니면 streak+1
    const todayKey = new Date().toDateString();
    const todayPost = myPosts.find(p => new Date(p.created_at).toDateString() === todayKey);
    const suggestedDay = todayPost ? streak : streak + 1;
    const fDayCount = document.getElementById('fDayCount');
    if (fDayCount && !fDayCount.value) fDayCount.value = suggestedDay;
  }
}
function closeModal() {
  modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  writeForm.reset();
  charCountEl.textContent = '0';
  selectedCategory = '습관';
  document.querySelectorAll('.cat-opt').forEach(b => b.classList.toggle('active', b.dataset.val === '습관'));
  resetImageUpload();
}

function resetImageUpload() {
  uploadedImageBase64 = '';
  previewImg.src = '';
  uploadPlaceholder.classList.remove('hidden');
  uploadPreview.classList.add('hidden');
  uploadProgress.classList.add('hidden');
  uploadProgressBar.style.width = '0%';
  fImageFile.value = '';
}

writeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = document.getElementById('fNickname').value.trim();
  const dayCount = parseInt(document.getElementById('fDayCount').value, 10);
  const content  = fContent.value.trim();
  if (!nickname) { showToast('닉네임을 입력해주세요'); return; }
  if (!content)  { showToast('오늘의 성장 내용을 작성해주세요'); return; }
  if (!dayCount || dayCount < 1) { showToast('도전 일수를 입력해주세요'); return; }

  const submitBtn = writeForm.querySelector('.btn-submit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

  try {
    const payload = {
      nickname,
      day_count: dayCount,
      category: selectedCategory,
      content,
      likes: 0,
      image_url: uploadedImageBase64 || '',
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      user_name: currentUser?.user_metadata?.full_name || null,
      user_avatar: currentUser?.user_metadata?.avatar_url || null,
    };
    await fetch(API, { method: 'POST', headers: HEADERS, body: JSON.stringify(payload) });
    closeModal();
    showToast('🌱 성장 기록이 올라갔어요!');
    await loadPosts();
    if (currentTab === 'my') renderMypage();
  } catch (err) {
    showToast('저장 중 오류가 발생했어요');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 기록 올리기';
  }
});

/* ============================================
   BIND EVENTS
   ============================================ */
function bindEvents() {
  openModalBtn.addEventListener('click', openModal);
  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  // 구글 로그인
  btnLogin.addEventListener('click', async () => {
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  });

  // 로그아웃
  btnLogout.addEventListener('click', async () => {
    await sb.auth.signOut();
    showToast('로그아웃됐어요 👋');
    currentUser = null;
    showLoginBtn();
    if (currentTab === 'my') switchTab('all');
  });

  // 마이페이지 버튼
  btnMypage.addEventListener('click', () => switchTab(currentTab === 'my' ? 'all' : 'my'));

  // 탭
  tabAll.addEventListener('click', () => switchTab('all'));
  tabMy.addEventListener('click', () => switchTab('my'));

  // 카테고리 필터
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCat = btn.dataset.cat;
      applyFilterAndRender();
    });
  });

  // 정렬
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      applyFilterAndRender();
    });
  });

  // 검색
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchQuery = searchInput.value; applyFilterAndRender(); }, 300);
  });

  // 더 보기
  loadMoreBtn.addEventListener('click', () => {
    currentPage++;
    renderPage();
    loadMoreBtn.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });

  // 작성 카테고리
  document.querySelectorAll('.cat-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = btn.dataset.val;
    });
  });

  // 글자수
  fContent.addEventListener('input', () => { charCountEl.textContent = fContent.value.length; });

  // ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) closeModal();
  });
}

/* ============================================
   IMAGE UPLOAD
   ============================================ */
function bindImageUpload() {
  uploadZone.addEventListener('click', (e) => {
    if (e.target === uploadRemove || uploadRemove.contains(e.target)) return;
    fImageFile.click();
  });
  fImageFile.addEventListener('change', () => { const file = fImageFile.files[0]; if (file) processImageFile(file); });
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault(); uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processImageFile(file);
    else showToast('이미지 파일만 업로드 가능해요');
  });
  uploadRemove.addEventListener('click', (e) => { e.stopPropagation(); resetImageUpload(); });
}

function processImageFile(file) {
  if (file.size > 5 * 1024 * 1024) { showToast('5MB 이하 이미지만 올릴 수 있어요'); return; }
  if (!file.type.startsWith('image/')) { showToast('이미지 파일만 업로드 가능해요'); return; }
  uploadProgress.classList.remove('hidden');
  uploadProgressBar.style.width = '0%';
  const reader = new FileReader();
  reader.onprogress = (e) => { if (e.lengthComputable) uploadProgressBar.style.width = Math.round((e.loaded/e.total)*90)+'%'; };
  reader.onload = (e) => {
    uploadProgressBar.style.width = '100%';
    setTimeout(() => uploadProgress.classList.add('hidden'), 400);
    resizeImage(e.target.result, 1200, 0.82, (resized) => {
      uploadedImageBase64 = resized;
      previewImg.src = resized;
      uploadFilename.textContent = file.name + ' (' + formatFileSize(file.size) + ')';
      uploadPlaceholder.classList.add('hidden');
      uploadPreview.classList.remove('hidden');
    });
  };
  reader.onerror = () => showToast('파일을 읽는 중 오류가 발생했어요');
  reader.readAsDataURL(file);
}

function resizeImage(dataUrl, maxWidth, quality, callback) {
  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    if (w > maxWidth) { h = Math.round((h*maxWidth)/w); w = maxWidth; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes+'B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1)+'KB';
  return (bytes/(1024*1024)).toFixed(1)+'MB';
}

function openLightbox(src) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `<button class="lightbox-close"><i class="fa-solid fa-xmark"></i></button><img src="${src}" alt="확대 이미지" />`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.lightbox-close')) {
      document.body.removeChild(overlay);
      document.body.style.overflow = '';
    }
  });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

/* ============================================
   SKELETON
   ============================================ */
function showSkeletons() {
  feedGrid.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    feedGrid.innerHTML += `<div class="skeleton-card"><div class="sk-row"><div class="skeleton sk-avatar"></div><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="skeleton sk-line sk-mid"></div><div class="skeleton sk-line sk-short"></div></div></div><div class="skeleton sk-line sk-long sk-block"></div><div class="skeleton sk-line sk-full sk-block"></div><div class="skeleton sk-line sk-mid sk-block"></div></div>`;
  }
}

/* ============================================
   TOAST
   ============================================ */
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2800);
}

/* ============================================
   UTILS
   ============================================ */
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff/86400)}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function stringHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash<<5)-hash)+str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}

function getCatEmoji(cat) {
  const map = {'공부':'📚','운동':'🏋️','독서':'📖','업무':'💼','습관':'✅','기술':'💻','기타':'🌱'};
  return map[cat] || '🌱';
}
