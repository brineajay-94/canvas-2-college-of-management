let sliderImageCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  await authService.init();
  if (!authService.requireAdmin('../login.html')) return;
  await loadSettings();
});

async function loadSettings() {
  try {
    const doc = await db.collection('settings').doc('general').get();
    if (doc.exists) {
      const s = doc.data();
      document.getElementById('collegeName').value = s.collegeName || '';
      document.getElementById('collegeAddress').value = s.address || '';
      document.getElementById('collegePhone').value = s.phone || '';
      document.getElementById('collegeEmail').value = s.email || '';
      document.getElementById('facebookUrl').value = s.facebook || '';
      document.getElementById('whatsappUrl').value = s.whatsapp || '';
      document.getElementById('mapEmbedUrl').value = s.mapEmbedUrl || '';

      sliderImageCount = 0;
      document.getElementById('sliderImagesContainer').innerHTML = '';
      if (s.sliderImages && s.sliderImages.length) {
        s.sliderImages.forEach(url => addSliderField(url));
      }
    }
    if (sliderImageCount === 0) addSliderField();
  } catch (err) {
    showToast('Error loading settings', 'error');
    addSliderField();
  }
}

function addSliderField(url = '') {
  const container = document.getElementById('sliderImagesContainer');
  const div = document.createElement('div');
  div.className = 'slider-image-field';
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
  div.innerHTML = `
    <input type="url" class="slider-image-input" value="${url}" placeholder="https://example.com/image.jpg" style="flex:1;padding:8px 12px;border:2px solid var(--color-border-default);border-radius:var(--radius-md);font-size:0.9rem;">
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">Remove</button>
  `;
  container.appendChild(div);
  sliderImageCount++;
}

function getSliderImages() {
  const inputs = document.querySelectorAll('.slider-image-input');
  return Array.from(inputs).map(inp => inp.value.trim()).filter(v => v);
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    collegeName: document.getElementById('collegeName').value.trim(),
    address: document.getElementById('collegeAddress').value.trim(),
    phone: document.getElementById('collegePhone').value.trim(),
    email: document.getElementById('collegeEmail').value.trim(),
    facebook: document.getElementById('facebookUrl').value.trim(),
    whatsapp: document.getElementById('whatsappUrl').value.trim(),
    mapEmbedUrl: document.getElementById('mapEmbedUrl').value.trim(),
    sliderImages: getSliderImages()
  };

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await db.collection('settings').doc('general').set(data, { merge: true });
    showToast('Settings saved successfully');
  } catch (err) {
    showToast(err.message || 'Error saving settings', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Settings';
  }
});
