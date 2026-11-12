
const API_URL = 'https://api.bankinator.online';

const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const form = document.getElementById('authForm');
const title = document.getElementById('formTitle');
const description = document.getElementById('formDescription');
const licenseGroup = document.getElementById('licenseGroup');
const licenseInput = document.getElementById('licenseKey');
const passwordInput = document.getElementById('password');
const errorText = document.getElementById('authError');
const submitButton = document.getElementById('submitButton');

let mode = 'login';

function switchMode(nextMode) {
  mode = nextMode;

  const registering = mode === 'register';

  loginTab.classList.toggle('active', !registering);
  registerTab.classList.toggle('active', registering);

  title.textContent = registering
    ? 'Skapa konto'
    : 'Logga in';

  description.textContent = registering
    ? 'Aktivera ditt konto med en giltig licensnyckel.'
    : 'Logga in för att fortsätta till Bankinator.';

  submitButton.textContent = registering
    ? 'Skapa konto'
    : 'Logga in';

  licenseGroup.hidden = !registering;
  licenseInput.required = registering;

  passwordInput.autocomplete = registering
    ? 'new-password'
    : 'current-password';

  passwordInput.minLength = registering ? 10 : 0;

  errorText.textContent = '';
}

loginTab.addEventListener('click', () => {
  switchMode('login');
});

registerTab.addEventListener('click', () => {
  switchMode('register');
});

form.addEventListener('submit', async event => {
  event.preventDefault();

  errorText.textContent = '';
  submitButton.disabled = true;

  const registering = mode === 'register';

  submitButton.textContent = 'Vänta...';

  const payload = {
    email: document.getElementById('email').value.trim(),
    password: passwordInput.value
  };

  if (registering) {
    payload.licenseKey = licenseInput.value
      .trim()
      .toUpperCase();
  }

  try {
    const response = await fetch(
      `${API_URL}${registering ? '/api/register' : '/api/login'}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || 'Något gick fel.'
      );
    }

    window.location.replace('/');

  } catch (error) {
    errorText.textContent =
      error.message || 'Kunde inte ansluta till servern.';

  } finally {
    submitButton.disabled = false;

    submitButton.textContent = registering
      ? 'Skapa konto'
      : 'Logga in';
  }
});

/* CHECK IF ALREADY LOGGED IN */

(async () => {
  try {
    const response = await fetch(`${API_URL}/api/me`, {
      credentials: 'include',
      cache: 'no-store'
    });

    if (!response.ok) return;

    const data = await response.json();

    if (data.loggedIn) {
      window.location.replace('/');
    }
  } catch (_) {}
})();
