import './style.css';

export function initializeLandingPage(document: Document): void {
  const form = document.querySelector<HTMLFormElement>('#shorten-form');
  const input = document.querySelector<HTMLInputElement>('#destination-url');
  const status = document.querySelector<HTMLElement>('#form-status');
  const year = document.querySelector<HTMLElement>('#current-year');

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();

    if ((input?.value.trim() ?? '') === '') {
      if (status) {
        status.textContent = 'Enter a URL when the admin API is available.';
      }
      input?.focus();
      return;
    }

    if (status) {
      status.textContent = 'Link creation will be available with the admin API.';
    }
  });
}

initializeLandingPage(document);
