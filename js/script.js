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
  overlay.classList.add('open');
  prepareScreenCapture();
});

function closeCard() {
  stopPixelation();
  overlay.classList.remove('open');
}

document.getElementById('closeId').addEventListener('click', closeCard);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeCard();
});

document.getElementById('scan').addEventListener('click', () => {
  showToast('QR-skanning kommer senare');
});

document.getElementById('menu').addEventListener('click', () => {
  showToast('Meny kommer senare');
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

      // Large, smooth, irregular deformations
      const deformation =
        Math.sin(angle * 2 + 0.5) * 0.15 +
        Math.sin(angle * 3 - 0.9) * 0.10 +
        Math.cos(angle * 5 + 0.8) * 0.06 +
        Math.sin(angle * 8 - 1.5) * 0.025;

      // Slight differences between individual lines
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

/* 23-SQUARE CENSOR LENS — confined to the white ID card */
const identityCard = document.querySelector('.identity');
const pixelPatch = document.getElementById('pixelPatch');
const yellowBox = document.querySelector('.yellow-box');
const originalBoxText = 'Skanna med en BankID-app';
yellowBox.textContent = originalBoxText;
const pixelCanvas = document.getElementById('pixelCanvas');
const pixelCtx = pixelCanvas.getContext('2d', { alpha: true });
const TILE = 28;
const SHAPE = ['00100','01110','11111','11111','11111','01110','00100'];
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
let pixelX = 0, pixelY = 0;
let restoreFrame = null;
let lensOpacity = 1;
let drawPending = false;
const sampleCanvas = document.createElement('canvas');
sampleCanvas.width = sampleCanvas.height = 1;
const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

async function prepareScreenCapture() {
  if (screenSnapshot) return screenSnapshot;
  if (capturePromise) return capturePromise;
  const version = ++captureVersion;
  const task = (async () => {
    if (typeof html2canvas !== 'function') return null;
    await Promise.all(Array.from(overlay.querySelectorAll('img')).map(img =>
      img.complete ? Promise.resolve() : new Promise(resolve => {
        img.addEventListener('load', resolve, { once:true });
        img.addEventListener('error', resolve, { once:true });
      })
    ));
    await new Promise(resolve => requestAnimationFrame(resolve));
    // Capture the card itself. Hide the lens in the clone to prevent feedback.
    const image = await html2canvas(identityCard, {
      backgroundColor: '#ffffff', scale: 1, useCORS: true, logging: false,
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
  try { return await task; }
  catch (error) { console.error('Card capture failed:', error); return null; }
  finally { if (capturePromise === task) capturePromise = null; }
}

function getPhonePosition(clientX, clientY) {
  const rect = identityCard.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * identityCard.clientWidth / rect.width,
    y: (clientY - rect.top) * identityCard.clientHeight / rect.height
  };
}
function positionPixelPatch() {
  pixelPatch.style.left = pixelX + 'px';
  pixelPatch.style.top = pixelY + 'px';
}
function drawPixelation() {
  if (!screenSnapshot) return;
  pixelCtx.clearRect(0, 0, PATCH_W, PATCH_H);
  const scaleX = screenSnapshot.width / identityCard.clientWidth;
  const scaleY = screenSnapshot.height / identityCard.clientHeight;
  const originX = pixelX - PATCH_W / 2;
  const originY = pixelY - PATCH_H / 2;
  pixelCtx.globalAlpha = lensOpacity;
  pixelCtx.imageSmoothingEnabled = true;
  for (let row = 0; row < SHAPE.length; row++) {
    for (let col = 0; col < SHAPE[row].length; col++) {
      if (SHAPE[row][col] !== '1') continue;
      const dx = (col + 1) * TILE;
      const dy = (row + 1) * TILE;
      // Sample the exact rectangular area covered by THIS square.
      // Downscale the full tile to one color, instead of sampling a
      // potentially offset single neighboring pixel.
      const sx = originX + dx;
      const sy = originY + dy;
      const x0 = Math.max(0, sx);
      const y0 = Math.max(0, sy);
      const x1 = Math.min(identityCard.clientWidth, sx + TILE);
      const y1 = Math.min(identityCard.clientHeight, sy + TILE);
      sampleCtx.clearRect(0, 0, 1, 1);
      if (x1 > x0 && y1 > y0) {
        sampleCtx.drawImage(screenSnapshot,
          x0 * scaleX, y0 * scaleY,
          (x1 - x0) * scaleX, (y1 - y0) * scaleY,
          0, 0, 1, 1);
        const rgba = sampleCtx.getImageData(0, 0, 1, 1).data;
        pixelCtx.fillStyle = `rgb(${rgba[0]},${rgba[1]},${rgba[2]})`;
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
  if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
  restoreFrame = null;
  pixelPatch.classList.remove('visible');
  pixelCtx.clearRect(0, 0, PATCH_W, PATCH_H);
  screenSnapshot = null;
}
overlay.addEventListener('pointerdown', event => {
  if (event.target.closest('button, .demo-logo')) return;
  if (!identityCard.contains(event.target) || pixelActive) return;
  if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
  restoreFrame = null;
  pixelActive = true
  yellowBox.innerHTML = "För godkänd kontroll:<br>Skanna med en BANKID-app";
  overlay.classList.add('lens-holding');
  lensOpacity = 1;
  activePointerId = event.pointerId;
  const pos = getPhonePosition(event.clientX, event.clientY);
  pixelX = pos.x; pixelY = pos.y;
  positionPixelPatch();
  try { overlay.setPointerCapture(event.pointerId); } catch (_) {}
  if (screenSnapshot) requestPixelDraw();
  else prepareScreenCapture();
});
overlay.addEventListener('pointermove', event => {
  if (!pixelActive || event.pointerId !== activePointerId) return;
  const pos = getPhonePosition(event.clientX, event.clientY);
  pixelX = pos.x; pixelY = pos.y;
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
    const t = Math.min(1, (now - start) / RELEASE_MS);
    lensOpacity = Math.pow(1 - t, 2);
    if (screenSnapshot) drawPixelation();
    if (t < 1) restoreFrame = requestAnimationFrame(frame);
    else {
      restoreFrame = null;
      pixelPatch.classList.remove('visible');
      pixelCtx.clearRect(0, 0, PATCH_W, PATCH_H);
    }
  }
  restoreFrame = requestAnimationFrame(frame);
}
overlay.addEventListener('pointerup', event => {
  if (event.pointerId === activePointerId) releasePixelation();
});
overlay.addEventListener('pointercancel', event => {
  if (event.pointerId === activePointerId) releasePixelation();
});
window.addEventListener('blur', () => {
  if (pixelActive) stopPixelation();
});

/* AUTOMATIC QR IMAGE SWITCHING */




/* CLICK, SLIDE AND RELEASE SOUNDS */
(() => {
  const clickSound = new Audio("./click.mp3");
  const slideSound = new Audio("./slide.mp3");
  const releaseSound = new Audio("./release.mp3");

  slideSound.loop = true;
  slideSound.preload = "auto";
  releaseSound.preload = "auto";
  clickSound.preload = "auto";

  let holding = false;
  let sliding = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let soundTimer = null;

  function playAudio(audio) {
    audio.currentTime = 0;
    audio.play().catch(error => {
      console.error("Audio error:", audio.src, error);
    });
  }

  // Listen on the entire document
  document.addEventListener("pointerdown", e => {
    const overlay = document.querySelector(".overlay");
    if (!overlay) return;

    const style = getComputedStyle(overlay);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) return;

    const rect = overlay.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) return;

    if (e.target.closest(".close")) return;

    holding = true;
    sliding = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;

    clearTimeout(soundTimer);

    slideSound.pause();
    slideSound.currentTime = 0;
    slideSound.volume = 0;

    // Start silently during the user interaction
    slideSound.play().catch(error => {
      console.error("Slide error:", error);
    });

    soundTimer = setTimeout(() => {
      if (holding && sliding) {
        slideSound.volume = 1;
      }
    }, 250);
  }, true);

  document.addEventListener("pointermove", e => {
    if (!holding || e.pointerId !== pointerId) return;

    const distance = Math.hypot(
      e.clientX - startX,
      e.clientY - startY
    );

    if (distance > 10 && !sliding) {
      sliding = true;
    }

    if (sliding) {
      slideSound.volume = 1;
    }
  }, true);

  function stopSound(e, cancelled = false) {
    if (!holding || e.pointerId !== pointerId) return;

    clearTimeout(soundTimer);

    slideSound.pause();
    slideSound.currentTime = 0;
    slideSound.volume = 0;

    if (!cancelled) {
      if (sliding) {
        playAudio(releaseSound);
      } else {
        playAudio(clickSound);
      }
    }

    holding = false;
    sliding = false;
    pointerId = null;
  }

  document.addEventListener("pointerup", e => {
    stopSound(e);
  }, true);

  document.addEventListener("pointercancel", e => {
    stopSound(e, true);
  }, true);

  console.log("BLY sound system loaded successfully");
})();


/* RANDOM QR CODE GENERATOR */

const qrContainer = document.getElementById("qrGenerator");

function generateRandomCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  const randomCode = Array.from(bytes, byte =>
    byte.toString(16).padStart(2, "0")
  ).join("").toUpperCase();

  return "BLY-DEMO-" + randomCode;
}

const qrGenerator = new QRCode(qrContainer, {
  text: generateRandomCode(),
  width: 150,
  height: 150,
  colorDark: "#000000",
  colorLight: "#ffffff",
  correctLevel: QRCode.CorrectLevel.M
});

// Generate a new QR code every second
setInterval(() => {
  qrGenerator.makeCode(generateRandomCode());
}, 1000);


/* QR COUNTDOWN - 60 SECONDS */

(() => {
  const overlay = document.querySelector(".overlay");
  const progress = document.getElementById("qrProgressFill");

  if (!overlay || !progress) return;

  let countdownTimer = null;
  let running = false;

  function isOverlayVisible() {
    const style = getComputedStyle(overlay);

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0 &&
      overlay.getClientRects().length > 0
    );
  }

  function startCountdown() {
    clearTimeout(countdownTimer);

    // Restart animation from full width
    progress.classList.remove("running");
    void progress.offsetWidth;
    progress.classList.add("running");

    countdownTimer = setTimeout(() => {
      if (!isOverlayVisible()) return;

      // Return to home screen
      const closeButton =
        overlay.querySelector(".close") ||
        document.querySelector(".close");

      if (closeButton) {
        closeButton.click();
      } else {
        overlay.style.display = "none";
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
      progress.classList.remove("running");
    }
  }

  // Detect when QR screen opens or closes
  const observer = new MutationObserver(checkOverlay);

  observer.observe(overlay, {
    attributes: true,
    attributeFilter: ["class", "style", "hidden"]
  });

  checkOverlay();
})();
