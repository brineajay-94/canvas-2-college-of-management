document.addEventListener('DOMContentLoaded', async () => {
  await authService.init();
  if (!authService.requireAdmin('../login.html')) return;
  await loadSliderImages();
});

async function loadSliderImages() {
  const grid = document.getElementById('sliderGrid');
  try {
    const doc = await db.collection('settings').doc('general').get();
    grid.innerHTML = '';
    if (doc.exists) {
      const s = doc.data();
      const urls = s.sliderImages || [];
      urls.forEach(url => addSliderCard(url));
    }
    renderAddButton();
  } catch (err) {
    showToast('Error loading slider images', 'error');
    renderAddButton();
  }
}

function addSliderCard(url) {
  const grid = document.getElementById('sliderGrid');
  const card = document.createElement('div');
  card.className = 'slider-card';
  const imgId = 'preview-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  card.innerHTML = `
    ${url ? '<img src="' + url + '" class="slider-card-preview" id="' + imgId + '" onerror="this.classList.add(\'hidden\');this.nextElementSibling.style.display=\'flex\'" onload="this.classList.remove(\'hidden\');this.nextElementSibling.style.display=\'none\'">' : ''}
    <div class="slider-card-placeholder" style="${url ? 'display:none' : 'display:flex'}"><i class="fas fa-image"></i></div>
    <div class="slider-card-body">
      <input type="url" class="slider-url-input" value="${url}" placeholder="https://example.com/image.jpg" oninput="onSliderUrlChange(this)">
      <button type="button" class="slider-card-remove" onclick="removeSliderCard(this)" title="Remove"><i class="fas fa-times"></i></button>
    </div>
  `;
  grid.insertBefore(card, grid.lastElementChild);
}

function onSliderUrlChange(input) {
  const card = input.closest('.slider-card');
  const url = input.value.trim();
  let img = card.querySelector('.slider-card-preview');
  let placeholder = card.querySelector('.slider-card-placeholder');
  if (!img) {
    img = document.createElement('img');
    img.className = 'slider-card-preview hidden';
    img.onerror = function() { this.classList.add('hidden'); if (this.nextElementSibling) this.nextElementSibling.style.display = 'flex'; };
    img.onload = function() { this.classList.remove('hidden'); if (this.nextElementSibling) this.nextElementSibling.style.display = 'none'; };
    card.insertBefore(img, card.querySelector('.slider-card-body'));
  }
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'slider-card-placeholder';
    placeholder.innerHTML = '<i class="fas fa-image"></i>';
    card.insertBefore(placeholder, img.nextSibling);
  }
  if (url) {
    img.src = url;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    placeholder.style.display = 'flex';
  }
}

function removeSliderCard(btn) {
  const card = btn.closest('.slider-card');
  card.remove();
}

function renderAddButton() {
  const grid = document.getElementById('sliderGrid');
  if (grid.querySelector('.slider-add-card')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'slider-add-card';
  btn.innerHTML = '<i class="fas fa-plus"></i><span>Add Image</span>';
  btn.onclick = function() { addSliderCard(''); };
  grid.appendChild(btn);
}

function getSliderImages() {
  const inputs = document.querySelectorAll('.slider-url-input');
  return Array.from(inputs).map(inp => inp.value.trim()).filter(v => v);
}

document.getElementById('sliderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = { sliderImages: getSliderImages() };
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await db.collection('settings').doc('general').set(data, { merge: true });
    showToast('Slider images saved successfully');
  } catch (err) {
    showToast(err.message || 'Error saving slider images', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Slider';
  }
});
