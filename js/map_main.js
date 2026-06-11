// js/map_main.js
import { fetchFestivals, supabase } from './map_api.js';
import { initMap, renderMarkers, panToFestival, closeOverlay } from './map_kakao.js';
import { renderList, setActiveCard, scrollToCard } from './map_ui.js';

// 현재 필터 상태
const state = {
  period: 'ongoing',
  areaCode: '',
};

// 검색 결과 저장
let searchFestivalResults = [];
let searchPlaceResults = [];

async function load() {
  showLoading(true);
  try {
    const festivals = await fetchFestivals(state);
    renderMarkers(festivals, onMarkerClick);
    renderList(festivals, onCardClick);
  } catch (err) {
    console.error('축제 데이터 로드 실패:', err);
    showError();
  } finally {
    showLoading(false);
  }
}

function onMarkerClick(festival) {
  setActiveCard(festival.id);
  scrollToCard(festival.id);
  // 모바일: 리스트 탭으로 전환
  if (window.innerWidth <= 768) switchTab('list');
}

function onCardClick(festival) {
  panToFestival(festival);
  // 모바일: 지도 탭으로 전환
  if (window.innerWidth <= 768) switchTab('map');
}

// ===== 필터 이벤트 =====
document.getElementById('filter-area').addEventListener('change', e => {
  state.areaCode = e.target.value;
  load();
});

document.getElementById('filter-period').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('#filter-period .chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  state.period = chip.dataset.value;
  load();
});

// ===== 검색 기능 =====
const searchInput = document.getElementById('map-search-input');
const searchBtn = document.getElementById('map-search-btn');
const searchPanel = document.getElementById('search-result-panel');
const searchFestivalList = document.getElementById('search-festival-list');
const searchPlaceList = document.getElementById('search-place-list');
const searchTabFestival = document.getElementById('search-tab-festival');
const searchTabPlace = document.getElementById('search-tab-place');
const searchClose = document.getElementById('search-result-close');

// 검색 실행
async function performSearch() {
  const keyword = searchInput.value.trim();
  if (!keyword) return;

  // 축제 검색 (Supabase)
  try {
    const { data, error } = await supabase
      .from('festivals')
      .select('id, content_id, title, start_date, end_date, addr, lat, lng, image_url, detail_url, area_code')
      .or(`title.ilike.%${keyword}%,addr.ilike.%${keyword}%`)
      .order('start_date', { ascending: true })
      .limit(50);

    if (error) throw error;
    searchFestivalResults = data ?? [];
  } catch (err) {
    console.error('축제 검색 실패:', err);
    searchFestivalResults = [];
  }

  // 카카오맵 장소 검색
  searchPlaceResults = [];
  try {
    const ps = new kakao.maps.services.Places();
    await new Promise((resolve) => {
      ps.keywordSearch(keyword, (data, status) => {
        if (status === kakao.maps.services.Status.OK) {
          searchPlaceResults = data.slice(0, 20).map(p => ({
            id: p.id,
            name: p.place_name,
            address: p.address_name,
            lat: parseFloat(p.y),
            lng: parseFloat(p.x),
            category: p.category_group_name || '',
            phone: p.phone || '',
          }));
        }
        resolve();
      });
    });
  } catch (err) {
    console.error('장소 검색 실패:', err);
  }

  // 패널 표시 및 렌더링
  renderSearchResults();
}

function renderSearchResults() {
  searchPanel.classList.remove('hidden');

  // 탭 텍스트 업데이트
  searchTabFestival.textContent = `축제 (${searchFestivalResults.length})`;
  searchTabPlace.textContent = `장소 (${searchPlaceResults.length})`;

  // 축제 결과 렌더
  renderFestivalSearchList();

  // 장소 결과 렌더
  renderPlaceSearchList();

  // 기본: 축제 탭 활성
  activateSearchTab('festival');
}

function renderFestivalSearchList() {
  searchFestivalList.innerHTML = '';

  if (searchFestivalResults.length === 0) {
    searchFestivalList.innerHTML = '<li class="search-empty">검색된 축제가 없습니다</li>';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  searchFestivalResults.forEach(f => {
    const isOngoing = f.start_date <= today && f.end_date >= today;
    const li = document.createElement('li');
    li.className = 'search-result-card';
    li.innerHTML = `
      <span class="card-badge ${isOngoing ? 'badge-ongoing' : 'badge-upcoming'}" style="font-size:10px;padding:1px 6px;">${isOngoing ? '● 진행 중' : '○ 예정'}</span>
      <p class="card-title" style="font-size:13px;margin:4px 0 2px;">${escHtml(f.title)}</p>
      <p class="search-result-meta">${f.start_date} ~ ${f.end_date}${f.addr ? ' · ' + escHtml(f.addr.slice(0, 18)) : ''}</p>
    `;
    li.addEventListener('click', () => {
      panToFestival(f);
      setActiveCard(f.id);
      scrollToCard(f.id);
      if (window.innerWidth <= 768) switchTab('map');
    });
    searchFestivalList.appendChild(li);
  });
}

function renderPlaceSearchList() {
  searchPlaceList.innerHTML = '';

  if (searchPlaceResults.length === 0) {
    searchPlaceList.innerHTML = '<li class="search-empty">검색된 장소가 없습니다</li>';
    return;
  }

  searchPlaceResults.forEach(p => {
    const li = document.createElement('li');
    li.className = 'search-result-card';
    li.innerHTML = `
      ${p.category ? `<span class="card-badge badge-upcoming" style="font-size:10px;padding:1px 6px;">${escHtml(p.category)}</span>` : ''}
      <p class="card-title" style="font-size:13px;margin:4px 0 2px;">${escHtml(p.name)}</p>
      <p class="search-result-meta">${escHtml(p.address)}${p.phone ? ' · ' + escHtml(p.phone) : ''}</p>
    `;
    li.addEventListener('click', () => {
      // 장소 위치로 지도 이동
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      if (typeof map !== 'undefined') {
        // map은 map_kakao.js 내부 변수이므로 panToFestival과 유사하게 처리
        panToFestival({ lat: p.lat, lng: p.lng, title: p.name, start_date: '', end_date: '', detail_url: '' });
      }
      if (window.innerWidth <= 768) switchTab('map');
    });
    searchPlaceList.appendChild(li);
  });
}

function activateSearchTab(tab) {
  if (tab === 'festival') {
    searchTabFestival.classList.add('active');
    searchTabPlace.classList.remove('active');
    searchFestivalList.classList.remove('hidden');
    searchPlaceList.classList.add('hidden');
  } else {
    searchTabFestival.classList.remove('active');
    searchTabPlace.classList.add('active');
    searchFestivalList.classList.add('hidden');
    searchPlaceList.classList.remove('hidden');
  }
}

// 검색 이벤트 바인딩
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performSearch();
  }
});

// 탭 전환
searchTabFestival.addEventListener('click', () => activateSearchTab('festival'));
searchTabPlace.addEventListener('click', () => activateSearchTab('place'));

// 검색 패널 닫기
searchClose.addEventListener('click', () => {
  searchPanel.classList.add('hidden');
  searchInput.value = '';
});

// HTML 이스케이프
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== 모바일 탭 =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  const main = document.querySelector('.main-content');
  const tabs = document.querySelectorAll('.tab-btn');
  main.classList.toggle('show-list', tab === 'list');
  tabs.forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive);
  });
}

// ===== 유틸 =====
function showLoading(on) {
  document.getElementById('map-loading').classList.toggle('hidden', !on);
}

function showError() {
  const list = document.getElementById('festival-list');
  list.innerHTML = `
    <li style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px;">
      데이터를 불러오지 못했습니다.<br>잠시 후 다시 시도해주세요.
    </li>`;
}

// ===== 초기화 =====
(async () => {
  await initMap();
  await load();
})();

