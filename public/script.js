let currentUser = null;
let swiper = null;

async function register() {
  const data = {
    user_name: document.getElementById('user_name').value,
    pin: document.getElementById('pin').value,
    tmdb_api: document.getElementById('tmdb_api').value,
    filmoteca_type: document.getElementById('filmoteca_type').value,
    sala_name: document.getElementById('sala_name').value
  };
  const res = await fetch('/api/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
  const result = await res.json();
  if (result.success) {
    localStorage.setItem('user_id', result.user_id);
    document.getElementById('registro-screen').classList.remove('active');
    document.getElementById('dashboard').classList.add('active');
    loadDashboard();
  }
}

async function loadDashboard() {
  // Carga salas, timeline, etc.
}

function showSection(section) {
  document.getElementById('content').innerHTML = `<h2>${section.toUpperCase()}</h2><div id="swiper-container"></div>`;
  if (section === 'busqueda') initTMDBSearch();
}

function initTMDBSearch() {
  // Barra búsqueda + fetch TMDB + Swiper carousel con ratings DB
  const swiperEl = document.createElement('div.class="swiper');
  // Implementar debounce search, TMDB API, modal add-to-sala
}

function showConfig() {
  // Modal editar perfil
}

// Init
if (localStorage.getItem('user_id')) {
  document.getElementById('registro-screen').classList.remove('active');
  document.getElementById('dashboard').classList.add('active');
}
