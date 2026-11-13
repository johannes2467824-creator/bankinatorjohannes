
/* PHONE SCALING */

function fitPhoneToScreen() {
  const phone = document.getElementById('phone');

  if (window.innerWidth <= 600) {
    phone.style.setProperty('--phone-scale', 1);
    return;
  }

  const scale = Math.min(
    (window.innerWidth - 50) / 390,
    (window.innerHeight - 50) / 844,
    1
  );

  phone.style.setProperty('--phone-scale', Math.max(.1, scale));
}

window.addEventListener('resize', fitPhoneToScreen);
fitPhoneToScreen();


/* NAVIGATION */

const phoneScreen = document.getElementById('phoneScreen');
const overlay = document.getElementById('overlay');
const toast = document.getElementById('toast');

let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.style.display = 'block';

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
  }, 2300);
}

document.getElementById('openId').addEventListener('click', () => {
  openDemoAuth();
});

function closeCard() {
  stopPixelation();
  overlay.classList.remove('open');
  closeDemoAuth();
}

document.getElementById('closeId').addEventListener('click', closeCard);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeCard();
});

document.getElementById('scan').addEventListener('click', () => {
  showToast('QR-skanning kommer senare');
});

document.getElementById('menu').addEventListener('click', () => {
  document.getElementById('blyProfileEditor').classList.add('open');
});

document.getElementById('more').addEventListener('click', () => {
  showToast('BLY Demo');
});


/* 32 ANIMATED DEFORMED SECURITY LINES */

{
  const clockwise = document.getElementById('clockwiseLines');
  const counterclockwise = document.getElementById('counterclockwiseLines');

  const colors = [
    '#e5a4ce',
    '#a4d7e1',
    '#b4b5df',
    '#b6d4d0'
  ];

  function addLine(group, index, reverse) {
    const path = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    );

    const points = [];
    const baseRadius = 25 + index * 20;

    for (let j = 0; j <= 240; j++) {
      const angle = (j / 240) * Math.PI * 2;

      const deformation =
        Math.sin(angle * 2 + 0.5) * 0.15 +
        Math.sin(angle * 3 - 0.9) * 0.10 +
        Math.cos(angle * 5 + 0.8) * 0.06 +
        Math.sin(angle * 8 - 1.5) * 0.025;

      const variation =
        Math.sin(angle * 4 + index * 0.12) * 2;

      const radius =
        baseRadius * (1 + deformation) + variation;

      const x =
        210 + Math.cos(angle) * radius * 1.08;

      const y =
        380 + Math.sin(angle) * radius * 1.17;

      points.push(
        `${j === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      );
    }

    path.setAttribute('d', points.join(' ') + ' Z');
    path.setAttribute('fill', 'none');

    path.setAttribute(
      'stroke',
      colors[(index + (reverse ? 2 : 0)) % colors.length]
    );

    path.setAttribute('stroke-width', '0.85');
    path.setAttribute('opacity', reverse ? '0.5' : '0.65');

    group.appendChild(path);
  }

  for (let i = 0; i < 32; i++) {
    addLine(clockwise, i, false);
    addLine(counterclockwise, i, true);
  }
}


/* PIXELATION EFFECT */

const identityCard = document.querySelector('.identity');
const pixelPatch = document.getElementById('pixelPatch');
const yellowBox = document.querySelector('.yellow-box');
const originalBoxText = 'Skanna med en BankID-app';

yellowBox.textContent = originalBoxText;

const pixelCanvas = document.getElementById('pixelCanvas');
const pixelCtx = pixelCanvas.getContext('2d', { alpha: true });

const TILE = 28;

const SHAPE = [
  '00100',
  '01110',
  '11111',
  '11111',
  '11111',
  '01110',
  '00100'
];

const PATCH_W = 7 * TILE;
const PATCH_H = 9 * TILE;
const RELEASE_MS = 470;

pixelCanvas.width = PATCH_W;
pixelCanvas.height = PATCH_H;

let screenSnapshot = null;
let capturePromise = null;
let captureVersion = 0;
let pixelActive = false;
let activePointerId = null;
let pixelX = 0;
let pixelY = 0;
let restoreFrame = null;
let lensOpacity = 1;
let drawPending = false;

const sampleCanvas = document.createElement('canvas');
sampleCanvas.width = 1;
sampleCanvas.height = 1;

const sampleCtx = sampleCanvas.getContext('2d', {
  willReadFrequently: true
});

async function prepareScreenCapture() {
  if (screenSnapshot) return screenSnapshot;
  if (capturePromise) return capturePromise;

  const version = ++captureVersion;

  const task = (async () => {
    if (typeof html2canvas !== 'function') return null;

    await Promise.all(
      Array.from(overlay.querySelectorAll('img')).map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise(resolve => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            })
      )
    );

    await new Promise(resolve => requestAnimationFrame(resolve));

    const image = await html2canvas(identityCard, {
      backgroundColor: '#ffffff',
      scale: 1,
      useCORS: true,
      logging: false,
      onclone: doc => {
        const patch = doc.getElementById('pixelPatch');
        if (patch) patch.style.visibility = 'hidden';
      }
    });

    if (version !== captureVersion) return null;

    screenSnapshot = image;

    if (pixelActive) requestPixelDraw();

    return image;
  })();

  capturePromise = task;

  try {
    return await task;
  } catch (error) {
    console.error('Card capture failed:', error);
    return null;
  } finally {
    if (capturePromise === task) capturePromise = null;
  }
}

function getPhonePosition(clientX, clientY) {
  const rect = identityCard.getBoundingClientRect();

  return {
    x: (clientX - rect.left) *
      identityCard.clientWidth / rect.width,

    y: (clientY - rect.top) *
      identityCard.clientHeight / rect.height
  };
}

function positionPixelPatch() {
  pixelPatch.style.left = pixelX + 'px';
  pixelPatch.style.top = pixelY + 'px';
}

function drawPixelation() {
  if (!screenSnapshot) return;

  pixelCtx.clearRect(0, 0, PATCH_W, PATCH_H);

  const scaleX =
    screenSnapshot.width / identityCard.clientWidth;

  const scaleY =
    screenSnapshot.height / identityCard.clientHeight;

  const originX = pixelX - PATCH_W / 2;
  const originY = pixelY - PATCH_H / 2;

  pixelCtx.globalAlpha = lensOpacity;
  pixelCtx.imageSmoothingEnabled = true;

  for (let row = 0; row < SHAPE.length; row++) {
    for (let col = 0; col < SHAPE[row].length; col++) {
      if (SHAPE[row][col] !== '1') continue;

      const dx = (col + 1) * TILE;
      const dy = (row + 1) * TILE;

      const sx = originX + dx;
      const sy = originY + dy;

      const x0 = Math.max(0, sx);
      const y0 = Math.max(0, sy);

      const x1 = Math.min(
        identityCard.clientWidth,
        sx + TILE
      );

      const y1 = Math.min(
        identityCard.clientHeight,
        sy + TILE
      );

      sampleCtx.clearRect(0, 0, 1, 1);

      if (x1 > x0 && y1 > y0) {
        sampleCtx.drawImage(
          screenSnapshot,
          x0 * scaleX,
          y0 * scaleY,
          (x1 - x0) * scaleX,
          (y1 - y0) * scaleY,
          0, 0, 1, 1
        );

        const rgba = sampleCtx.getImageData(0, 0, 1, 1).data;

        pixelCtx.fillStyle =
          `rgb(${rgba[0]},${rgba[1]},${rgba[2]})`;
      } else {
        pixelCtx.fillStyle = '#ffffff';
      }

      pixelCtx.fillRect(dx, dy, TILE, TILE);
    }
  }

  pixelCtx.globalAlpha = 1;
  pixelPatch.classList.add('visible');
}

function requestPixelDraw() {
  if (drawPending) return;

  drawPending = true;

  requestAnimationFrame(() => {
    drawPending = false;

    if (!pixelActive || !screenSnapshot) return;

    positionPixelPatch();
    drawPixelation();
  });
}

function stopPixelation() {
  pixelActive = false;
  activePointerId = null;

  overlay.classList.remove('lens-holding');
  yellowBox.textContent = originalBoxText;

  captureVersion++;

  if (restoreFrame !== null) {
    cancelAnimationFrame(restoreFrame);
  }

  restoreFrame = null;

  pixelPatch.classList.remove('visible');
  pixelCtx.clearRect(0, 0, PATCH_W, PATCH_H);

  screenSnapshot = null;
}

overlay.addEventListener('pointerdown', event => {
  if (event.target.closest('button, .demo-logo')) return;
  if (!identityCard.contains(event.target) || pixelActive) return;

  if (restoreFrame !== null) {
    cancelAnimationFrame(restoreFrame);
  }

  restoreFrame = null;
  pixelActive = true;

  yellowBox.innerHTML =
    'För godkänd kontroll:<br>Skanna med en BANKID-app';

  overlay.classList.add('lens-holding');

  lensOpacity = 1;
  activePointerId = event.pointerId;

  const pos = getPhonePosition(
    event.clientX,
    event.clientY
  );

  pixelX = pos.x;
  pixelY = pos.y;

  positionPixelPatch();

  try {
    overlay.setPointerCapture(event.pointerId);
  } catch (_) {}

  if (screenSnapshot) requestPixelDraw();
  else prepareScreenCapture();
});

overlay.addEventListener('pointermove', event => {
  if (!pixelActive || event.pointerId !== activePointerId) return;

  const pos = getPhonePosition(
    event.clientX,
    event.clientY
  );

  pixelX = pos.x;
  pixelY = pos.y;

  requestPixelDraw();
});

function releasePixelation() {
  if (!pixelActive) return;

  overlay.classList.remove('lens-holding');

  pixelActive = false;
  yellowBox.textContent = originalBoxText;
  activePointerId = null;

  const start = performance.now();

  function frame(now) {
    const t = Math.min(
      1,
      (now - start) / RELEASE_MS
    );

    lensOpacity = Math.pow(1 - t, 2);

    if (screenSnapshot) drawPixelation();

    if (t < 1) {
      restoreFrame = requestAnimationFrame(frame);
    } else {
      restoreFrame = null;

      pixelPatch.classList.remove('visible');
      pixelCtx.clearRect(0, 0, PATCH_W, PATCH_H);
    }
  }

  restoreFrame = requestAnimationFrame(frame);
}

overlay.addEventListener('pointerup', event => {
  if (event.pointerId === activePointerId) {
    releasePixelation();
  }
});

overlay.addEventListener('pointercancel', event => {
  if (event.pointerId === activePointerId) {
    releasePixelation();
  }
});

window.addEventListener('blur', () => {
  if (pixelActive) stopPixelation();
});


/* CLICK, SLIDE AND RELEASE SOUNDS */

(() => {
  const clickSound = new Audio('./click.mp3');
  const slideSound = new Audio('./slide.mp3');
  const releaseSound = new Audio('./release.mp3');

  slideSound.loop = true;

  [clickSound, slideSound, releaseSound].forEach(audio => {
    audio.preload = 'auto';
  });

  let holding = false;
  let sliding = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let soundTimer = null;

  function playAudio(audio) {
    audio.currentTime = 0;

    audio.play().catch(error => {
      console.error('Audio error:', audio.src, error);
    });
  }

  document.addEventListener('pointerdown', e => {
    const currentOverlay =
      document.querySelector('.overlay');

    if (!currentOverlay) return;

    const style = getComputedStyle(currentOverlay);

    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0
    ) return;

    const rect = currentOverlay.getBoundingClientRect();

    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) return;

    if (e.target.closest('.close')) return;

    holding = true;
    sliding = false;
    pointerId = e.pointerId;

    startX = e.clientX;
    startY = e.clientY;

    clearTimeout(soundTimer);

    slideSound.pause();
    slideSound.currentTime = 0;
    slideSound.volume = 0;

    slideSound.play().catch(error => {
      console.error('Slide error:', error);
    });

    soundTimer = setTimeout(() => {
      if (holding && sliding) {
        slideSound.volume = 1;
      }
    }, 250);
  }, true);

  document.addEventListener('pointermove', e => {
    if (!holding || e.pointerId !== pointerId) return;

    const distance = Math.hypot(
      e.clientX - startX,
      e.clientY - startY
    );

    if (distance > 10 && !sliding) {
      sliding = true;
    }

    if (sliding) slideSound.volume = 1;
  }, true);

  function stopSound(e, cancelled = false) {
    if (!holding || e.pointerId !== pointerId) return;

    clearTimeout(soundTimer);

    slideSound.pause();
    slideSound.currentTime = 0;
    slideSound.volume = 0;

    if (!cancelled) {
      playAudio(sliding ? releaseSound : clickSound);
    }

    holding = false;
    sliding = false;
    pointerId = null;
  }

  document.addEventListener('pointerup', e => {
    stopSound(e);
  }, true);

  document.addEventListener('pointercancel', e => {
    stopSound(e, true);
  }, true);
})();


/* RANDOM QR CODE GENERATOR */

const qrContainer = document.getElementById('qrGenerator');

function generateRandomCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  const randomCode = Array.from(bytes, byte =>
    byte.toString(16).padStart(2, '0')
  ).join('').toUpperCase();

  return (
    'https://johannes2467824-creator.github.io/verification/?code=' +
    randomCode
  );
}

const qrGenerator = new QRCode(qrContainer, {
  text: generateRandomCode(),
  width: 150,
  height: 150,
  colorDark: '#000000',
  colorLight: '#ffffff',
  correctLevel: QRCode.CorrectLevel.M
});

setInterval(() => {
  qrGenerator.makeCode(generateRandomCode());
}, 1000);


/* QR COUNTDOWN - 60 SECONDS */

(() => {
  const currentOverlay =
    document.querySelector('.overlay');

  const progress =
    document.getElementById('qrProgressFill');

  if (!currentOverlay || !progress) return;

  let countdownTimer = null;
  let running = false;

  function isOverlayVisible() {
    const style = getComputedStyle(currentOverlay);

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) > 0 &&
      currentOverlay.getClientRects().length > 0
    );
  }

  function startCountdown() {
    clearTimeout(countdownTimer);

    progress.classList.remove('running');
    void progress.offsetWidth;
    progress.classList.add('running');

    countdownTimer = setTimeout(() => {
      if (!isOverlayVisible()) return;

      const closeButton =
        currentOverlay.querySelector('.close') ||
        document.querySelector('.close');

      if (closeButton) {
        closeButton.click();
      } else {
        currentOverlay.style.display = 'none';
      }
    }, 60000);
  }

  function checkOverlay() {
    if (isOverlayVisible()) {
      if (!running) {
        running = true;
        startCountdown();
      }
    } else {
      running = false;
      clearTimeout(countdownTimer);
      progress.classList.remove('running');
    }
  }

  const observer = new MutationObserver(checkOverlay);

  observer.observe(currentOverlay, {
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden']
  });

  checkOverlay();
})();


/* BLY DEMO AUTHENTICATION */

(() => {
  const panel = document.createElement('section');

  panel.id = 'blyDemoAuth';

  panel.setAttribute(
    'aria-label',
    'BLY Demo identifiering'
  );

  panel.innerHTML = `
    <header class="demo-auth-header">
      <button type="button" id="demoAuthCancel">
        Avbryt
      </button>

      <span>IDENTIFIERING</span>

      <small>
        <img
          src="assets/images/verification-logo.png"
          class="verification-logo"
          alt="BLY">
      </small>
    </header>

    <div class="demo-auth-main">
      <div class="demo-auth-name">Johannes Young</div>

      <div class="demo-auth-subtitle">
        Jag identifierar mig hos:
      </div>

      <div class="demo-auth-target">BankID-kort</div>

      <hr>

      <div class="demo-auth-purpose">
        Min avsikt:<br>Visa ID-kort.
      </div>
    </div>

    <div class="demo-auth-bottom" id="demoAuthStart">
      <button type="button" id="demoAuthStartButton">
        Identifiera med säkerhetskod
      </button>
    </div>

    <div
      class="demo-auth-keypad-area"
      id="demoAuthKeypadArea"
      hidden>

      <div class="demo-auth-code">
        <span id="demoAuthCodeDots">
          Säkerhetskod
        </span>
      </div>

      <div class="demo-auth-grid">
        <button data-digit="1">1</button>
        <button data-digit="2">2 <small>ABC</small></button>
        <button data-digit="3">3 <small>DEF</small></button>

        <button data-digit="4">4 <small>GHI</small></button>
        <button data-digit="5">5 <small>JKL</small></button>
        <button data-digit="6">6 <small>MNO</small></button>

        <button data-digit="7">7 <small>PQRS</small></button>
        <button data-digit="8">8 <small>TUV</small></button>
        <button data-digit="9">9 <small>WXYZ</small></button>

        <button id="demoAuthBackspace" aria-label="Radera">
          ⌫
        </button>

        <button data-digit="0">0</button>

        <button id="demoAuthSubmit" disabled>
          Identifiera
        </button>
      </div>

      <p id="demoAuthError" role="status"></p>
    </div>
  `;

  phoneScreen.appendChild(panel);

  const start =
    panel.querySelector('#demoAuthStart');

  const keypad =
    panel.querySelector('#demoAuthKeypadArea');

  const dots =
    panel.querySelector('#demoAuthCodeDots');

  const submit =
    panel.querySelector('#demoAuthSubmit');

  const error =
    panel.querySelector('#demoAuthError');

  let code = '';

  function update() {
    dots.textContent = code
      ? '*'.repeat(code.length)
      : 'Säkerhetskod';

    submit.disabled = code.length !== 6;
    error.textContent = '';
  }

  function close() {
    panel.classList.remove('open');
    keypad.classList.remove('keypad-visible');

    code = '';
    update();
  }

  window.openDemoAuth = () => {
    code = '';
    update();

    keypad.classList.remove('keypad-visible');
    keypad.hidden = true;
    start.hidden = false;

    panel.classList.add('open');
  };

  window.closeDemoAuth = close;

  panel.querySelector('#demoAuthCancel')
    .addEventListener('click', close);

  panel.querySelector('#demoAuthStartButton')
    .addEventListener('click', () => {
      start.hidden = true;
      keypad.hidden = false;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          keypad.classList.add('keypad-visible');
        });
      });
    });

  panel.querySelectorAll('[data-digit]').forEach(button => {
    button.addEventListener('click', () => {
      if (code.length < 6) {
        code += button.dataset.digit;
      }

      update();
    });
  });

  panel.querySelector('#demoAuthBackspace')
    .addEventListener('click', () => {
      code = code.slice(0, -1);
      update();
    });

  function accept() {
    const correctPIN =
      localStorage.getItem('blyDemoPIN') || '123456';

    if (code !== correctPIN) {
      code = '';
      update();

      error.textContent = 'Försök igen';
      return;
    }

    close();

    overlay.classList.add('open');
    prepareScreenCapture();
  }

  submit.addEventListener('click', accept);

  document.addEventListener('keydown', event => {
    if (
      !panel.classList.contains('open') ||
      keypad.hidden
    ) return;

    if (/^[0-9]$/.test(event.key)) {
      if (code.length < 6) {
        code += event.key;
      }

      update();
    }

    if (event.key === 'Backspace') {
      code = code.slice(0, -1);
      update();
    }

    if (event.key === 'Enter' && code.length === 6) {
      accept();
    }
  });
})();


/* BLY DEMO PROFILE EDITOR */

(() => {
  const editor = document.createElement('section');

  editor.id = 'blyProfileEditor';

  editor.innerHTML = `
    <div class="profile-editor-header">
      <button id="closeProfileEditor" type="button">
        ← Tillbaka
      </button>

      <span>Redigera demoprofil</span>
    </div>

    <div class="profile-editor-content">
      <img
        id="profileEditorPreview"
        src="assets/images/portrait.png"
        alt="Demoporträtt">

      <button id="openPortraitCamera" type="button">
        📷 Ta porträtt med kamera
      </button>

      <label for="profileImageInput">
        Byt porträtt
      </label>

      <input
        id="profileImageInput"
        type="file"
        accept="image/png,image/jpeg,image/webp">

      <label for="profileNameInput">Namn</label>

      <input
        id="profileNameInput"
        type="text"
        maxlength="60"
        placeholder="Namn">

      <label for="profileNumberInput">Nummer</label>

      <input
        id="profileNumberInput"
        type="text"
        maxlength="30"
        placeholder="Nummer">

      <label for="profilePinInput">
        Ändra PIN-kod
      </label>

      <input
        id="profilePinInput"
        type="password"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="6"
        autocomplete="off"
        placeholder="Ny 6-siffrig PIN">

      <button id="saveBlyProfile" type="button">
        Spara ändringar
      </button>
    </div>
  `;

  phoneScreen.appendChild(editor);

  const portrait =
    document.querySelector('.portrait');

  const personName =
    document.querySelector('.person-name');

  const personNumber =
    document.querySelector('.number');

  const preview =
    editor.querySelector('#profileEditorPreview');

  const nameInput =
    editor.querySelector('#profileNameInput');

  const numberInput =
    editor.querySelector('#profileNumberInput');

  const imageInput =
    editor.querySelector('#profileImageInput');

  const pinInput =
    editor.querySelector('#profilePinInput');

  const storageKey = 'blyDemoProfile';
  const defaultPortrait = 'assets/images/portrait.png';

  let profile = {
    name: personName.textContent.trim(),
    number: personNumber.textContent.trim(),
    portrait: defaultPortrait
  };

  try {
    const saved = JSON.parse(
      localStorage.getItem(storageKey)
    );

    if (saved && typeof saved === 'object') {
      profile = { ...profile, ...saved };
    }
  } catch (_) {}

  function applyProfile() {
    portrait.src = profile.portrait || defaultPortrait;

    personName.textContent = profile.name;
    personNumber.textContent = profile.number;

    preview.src = portrait.src;

    nameInput.value = profile.name;
    numberInput.value = profile.number;

    const authName =
      document.querySelector('.demo-auth-name');

    if (authName) {
      authName.textContent = profile.name;
    }
  }

  applyProfile();

  editor.querySelector('#closeProfileEditor')
    .addEventListener('click', () => {
      editor.classList.remove('open');
    });

  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];

    if (!file) return;

    if (
      !['image/png', 'image/jpeg', 'image/webp']
        .includes(file.type)
    ) {
      alert('Välj en PNG-, JPG- eller WebP-bild.');
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      preview.src = reader.result;
    };

    reader.readAsDataURL(file);
  });

  editor.querySelector('#saveBlyProfile')
    .addEventListener('click', () => {
      const newPin = pinInput.value.trim();

      if (newPin) {
        if (!/^\d{6}$/.test(newPin)) {
          alert(
            'PIN-koden måste innehålla exakt 6 siffror.'
          );
          return;
        }

        try {
          localStorage.setItem('blyDemoPIN', newPin);
          pinInput.value = '';
        } catch (error) {
          alert('Kunde inte spara PIN-koden.');
          return;
        }
      }

      profile.name =
        nameInput.value.trim() || profile.name;

      profile.number =
        numberInput.value.trim() || profile.number;

      profile.portrait = preview.src;

      applyProfile();

      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(profile)
        );
      } catch (error) {
        alert(
          'Profilen ändrades, men bilden kunde inte sparas permanent. ' +
          'Prova en mindre bild.'
        );
      }

      captureVersion++;
      screenSnapshot = null;

      editor.classList.remove('open');
    });
})();


/* BLY DEMO PORTRAIT CAMERA */
/* NORMAL PHOTO + SAVE TO CAMERA ROLL */

(() => {
  const editor =
    document.getElementById('blyProfileEditor');

  const preview =
    document.getElementById('profileEditorPreview');

  const openButton =
    document.getElementById('openPortraitCamera');

  if (!editor || !preview || !openButton) return;

  const camera = document.createElement('div');
  camera.id = 'blyPortraitCamera';

  camera.innerHTML = `
    <div class="portrait-camera-header">
      <button type="button" id="closePortraitCamera">
        ← Tillbaka
      </button>

      <span>Ta porträtt</span>
    </div>

    <div class="portrait-camera-stage">
      <video
        id="portraitCameraVideo"
        autoplay
        playsinline
        muted></video>

      <img
        id="portraitCameraGuide"
        src="assets/images/portrait-outline.png"
        alt="Porträttkontur">

      <div class="portrait-camera-instructions">
        Anpassa ansikte och axlar efter konturen
      </div>
    </div>

    <div class="portrait-camera-controls">
      <button
        type="button"
        id="capturePortrait"
        aria-label="Ta bild">

        <span class="camera-shutter"></span>
      </button>
    </div>
  `;

  editor.appendChild(camera);

  const video =
    camera.querySelector('#portraitCameraVideo');

  const captureButton =
    camera.querySelector('#capturePortrait');

  const saveButton = document.createElement('button');

  saveButton.id = 'savePortraitToPhotos';
  saveButton.type = 'button';
  saveButton.textContent = 'Spara till bilder';
  saveButton.style.display = 'none';

  openButton.insertAdjacentElement('afterend', saveButton);

  let stream = null;
  let capturedBlob = null;

  async function openCamera() {
    camera.classList.add('open');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Kameran kräver HTTPS eller localhost.'
        );
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,

        video: {
          facingMode: 'user',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      video.srcObject = stream;

      await video.play();

    } catch (error) {
      console.error('Camera error:', error);

      alert(
        'Kameran kunde inte startas: ' +
        (error?.message || String(error))
      );

      closeCamera();
    }
  }

  function closeCamera() {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });

      stream = null;
    }

    video.srcObject = null;

    camera.classList.remove('open');
  }

  openButton.addEventListener('click', openCamera);

  camera.querySelector('#closePortraitCamera')
    .addEventListener('click', closeCamera);

  captureButton.addEventListener('click', async () => {
    if (!video.videoWidth || !video.videoHeight) return;

    captureButton.disabled = true;

    try {
      const canvas = document.createElement('canvas');

      canvas.width = 941;
      canvas.height = 1672;

      const ctx = canvas.getContext('2d');

      const scale = Math.min(
        canvas.width / video.videoWidth,
        canvas.height / video.videoHeight
      );

      const drawWidth = video.videoWidth * scale;
      const drawHeight = video.videoHeight * scale;

      const x = (canvas.width - drawWidth) / 2;
      const y = (canvas.height - drawHeight) / 2;

      // Mirror the front camera to match the preview.
      
// Draw the camera image without mirroring.
ctx.drawImage(
  video,
  x,
  y,
  drawWidth,
  drawHeight
);


      // Save the photo with its original background.
      capturedBlob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (!capturedBlob) {
        throw new Error('Kunde inte skapa bilden.');
      }

      // Show the captured portrait in the profile editor.
      preview.src = canvas.toDataURL('image/png');

      // Show the camera-roll save button.
      saveButton.style.display = 'block';

      closeCamera();

    } catch (error) {
      console.error('Capture error:', error);

      alert(
        'Kunde inte ta bilden: ' +
        (error?.message || String(error))
      );

    } finally {
      captureButton.disabled = false;
    }
  });

  /* SAVE PORTRAIT TO CAMERA ROLL */

  saveButton.addEventListener('click', async () => {
    if (!capturedBlob) {
      alert('Ta en bild först.');
      return;
    }

    const file = new File(
      [capturedBlob],
      'BLY-portratt.png',
      { type: 'image/png' }
    );

    // Open the native share sheet when supported.
    if (
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: 'BLY porträtt'
        });

        return;

      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        console.warn('Share failed:', error);
      }
    }

    // Fallback: download the photo.
    const url = URL.createObjectURL(capturedBlob);

    const link = document.createElement('a');

    link.href = url;
    link.download = 'BLY-portratt.png';

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  });
})();


/* BLY DEMO PORTRAIT TUTORIAL */

(() => {
  const editor = document.getElementById('blyProfileEditor');
  if (!editor) return;

  const content = editor.querySelector('.profile-editor-content');
  const header = editor.querySelector('.profile-editor-header');

  if (!content || !header) return;

  // Create tutorial tab button
  const tutorialButton = document.createElement('button');
  tutorialButton.id = 'openPortraitTutorial';
  tutorialButton.type = 'button';
  tutorialButton.textContent = '📖 Guide – Så fixar du ditt porträtt';

  // Place tutorial button at the top of the menu
  content.insertBefore(tutorialButton, content.firstChild);

  // Create tutorial screen
  const tutorial = document.createElement('section');
  tutorial.id = 'blyPortraitTutorial';

  tutorial.innerHTML = `
    <div class="portrait-tutorial-header">
      <button id="closePortraitTutorial" type="button">
        ← Tillbaka
      </button>
      <span>Porträttguide</span>
    </div>

    <div class="portrait-tutorial-content">

      <h2>Så skapar du ditt porträtt</h2>

      <p class="tutorial-intro">
        Följ de fyra stegen nedan för att skapa ett porträtt
        som passar i ditt BLY Demo-ID. Du behöver bara
        din mobilkamera och ChatGPT.
      </p>

      <div class="tutorial-step">
        <div class="tutorial-step-number">1</div>

        <h3>Ta ett porträtt med kameran</h3>

        <p>
          Gå tillbaka till menyn och tryck på
          <strong>”Ta porträtt med kamera”</strong>.
        </p>

        <p>
          Placera ditt ansikte och dina axlar innanför
          den svarta konturen som visas på skärmen.
          Konturen hjälper dig att få rätt placering
          och storlek på porträttet.
        </p>

        <p>
          Titta rakt in i kameran, håll huvudet rakt
          och se till att hela ansiktet syns tydligt.
          Använd gärna bra belysning och undvik
          kraftiga skuggor över ansiktet.
        </p>

        <p>
          När du är nöjd trycker du på den runda
          kameraknappen för att ta bilden.
        </p>
      </div>

      <div class="tutorial-step">
        <div class="tutorial-step-number">2</div>

        <h3>Spara bilden på mobilen</h3>

        <p>
          När du har tagit bilden kommer den
          automatiskt att visas i profilredigeraren.
        </p>

        <p>
          Tryck på knappen
          <strong>”Spara till bilder”</strong>.
        </p>

        <p>
          Om du använder iPhone öppnas normalt
          delningsmenyn. Välj
          <strong>”Spara bild”</strong>
          för att lägga till porträttet i appen Bilder.
        </p>

        <p>
          På andra enheter kan bilden i stället
          laddas ner till mappen Hämtade filer.
          Kontrollera att bilden har sparats
          innan du fortsätter.
        </p>
      </div>

      <div class="tutorial-step">
        <div class="tutorial-step-number">3</div>

        <h3>Ta bort bakgrunden med ChatGPT</h3>

        <p>
          Öppna ChatGPT på din mobil eller
          gå till chatgpt.com i webbläsaren.
        </p>

        <p>
          Starta en ny konversation och ladda upp
          porträttet du precis sparade.
        </p>

        <p>
          Skicka sedan följande instruktion:
        </p>

        <div class="tutorial-prompt">
          Ta bort bakgrunden från den här bilden
          så att den blir helt genomskinlig.
          Behåll mitt ansikte, hår, kläder och
          alla detaljer exakt som på originalbilden.
          Ändra inte mitt utseende, ansiktsdrag,
          proportioner eller bildens storlek.
          Spara resultatet som en PNG-bild
          med transparent bakgrund.
        </div>

        <button
          type="button"
          id="copyPortraitPrompt"
          class="tutorial-copy-button">
          Kopiera instruktionen
        </button>

        <p>
          När ChatGPT har bearbetat bilden,
          kontrollera att bakgrunden är
          genomskinlig och att hela ditt
          ansikte och dina axlar finns kvar.
        </p>

        <p>
          Spara sedan den färdiga PNG-bilden
          på din mobil.
        </p>

        <p>
          <strong>Tips:</strong> Om något har
          förändrats i ansiktet eller kläderna,
          be ChatGPT att försöka igen och
          behålla originalets detaljer.
        </p>
      </div>

      <div class="tutorial-step">
        <div class="tutorial-step-number">4</div>

        <h3>Ladda upp ditt färdiga porträtt</h3>

        <p>
          Gå tillbaka till BLY Demo och
          öppna menyn igen.
        </p>

        <p>
          Tryck på <strong>”Byt porträtt”</strong>
          och välj den färdiga PNG-bilden
          med genomskinlig bakgrund.
        </p>

        <p>
          Kontrollera förhandsvisningen så
          att bilden ser korrekt ut.
        </p>

        <p>
          Tryck slutligen på
          <strong>”Spara ändringar”</strong>.
        </p>

        <p>
          Ditt nya porträtt används nu
          på ditt BLY Demo-ID på den här enheten.
        </p>
      </div>

      <div class="tutorial-finished">
        <h3>Klart!</h3>
        <p>
          Du har nu skapat och lagt till
          ditt personliga demoporträtt.
        </p>

        <button type="button" id="finishPortraitTutorial">
          Tillbaka till menyn
        </button>
      </div>

    </div>
  `;

  editor.appendChild(tutorial);

  function openTutorial() {
    tutorial.classList.add('open');
    tutorial.scrollTop = 0;
  }

  function closeTutorial() {
    tutorial.classList.remove('open');
  }

  tutorialButton.addEventListener('click', openTutorial);

  tutorial.querySelector('#closePortraitTutorial')
    .addEventListener('click', closeTutorial);

  tutorial.querySelector('#finishPortraitTutorial')
    .addEventListener('click', closeTutorial);

  // Copy the ChatGPT instructions
  tutorial.querySelector('#copyPortraitPrompt')
    .addEventListener('click', async () => {
      const prompt = tutorial
        .querySelector('.tutorial-prompt')
        .textContent
        .replace(/\s+/g, ' ')
        .trim();

      try {
        await navigator.clipboard.writeText(prompt);

        const button = tutorial.querySelector(
          '#copyPortraitPrompt'
        );

        button.textContent = '✓ Kopierat!';

        setTimeout(() => {
          button.textContent = 'Kopiera instruktionen';
        }, 2000);

      } catch (error) {
        console.error('Copy failed:', error);
        alert('Kunde inte kopiera texten automatiskt.');
      }
    });
})();



/* BANKINATOR ACCOUNT - LOGOUT BUTTON */

(() => {
  const editor = document.getElementById('blyProfileEditor');
  const content = editor?.querySelector('.profile-editor-content');

  if (!content) return;

  const logoutButton = document.createElement('button');

  logoutButton.id = 'blyLogout';
  logoutButton.type = 'button';
  logoutButton.textContent = 'Logga ut';

  logoutButton.style.cssText = `
    display: block;
    width: 100%;
    padding: 14px;
    margin-top: 24px;
    background: #263e64;
    border: 1px solid #55718b;
    border-radius: 8px;
    color: white;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  `;

  content.appendChild(logoutButton);

  logoutButton.addEventListener('click', async () => {
    if (!confirm('Vill du logga ut från Bankinator?')) return;

    logoutButton.disabled = true;

    try {
      const response = await fetch(
        'https://api.bankinator.online/api/logout',
        {
          method: 'POST',
          credentials: 'include'
        }
      );

      if (!response.ok) {
        throw new Error('Kunde inte logga ut.');
      }

      window.location.replace('/login.html');

    } catch (error) {
      alert(error.message);
      logoutButton.disabled = false;
    }
  });
})();


/* BANKINATOR ACCOUNT - SESSION CHECK */

(() => {
  let currentUserId = null;
  let checking = false;

  async function checkCurrentAccount() {
    if (checking) return;
    checking = true;

    try {
      const response = await fetch(
        'https://api.bankinator.online/api/me',
        {
          credentials: 'include',
          cache: 'no-store'
        }
      );

      if (!response.ok) return;

      const data = await response.json();

      if (!data.loggedIn) {
        window.location.replace('/login.html');
        return;
      }

      if (!data.user || !data.user.id) {
        window.location.replace('/login.html');
        return;
      }

      if (currentUserId === null) {
        currentUserId = data.user.id;
        return;
      }

      if (currentUserId !== data.user.id) {
        window.location.replace('/login.html');
      }

    } catch (error) {
      console.error('Account check failed:', error);

    } finally {
      checking = false;
    }
  }

  checkCurrentAccount();

  // Check every 3 seconds.
  setInterval(checkCurrentAccount, 3000);

  // Check when returning to the browser tab.
  window.addEventListener('focus', checkCurrentAccount);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkCurrentAccount();
  });
})();
