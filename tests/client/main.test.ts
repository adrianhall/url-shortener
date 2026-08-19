import { beforeEach, describe, expect, it } from 'vitest';
import { initializeLandingPage } from '../../src/client/main';

describe('initializeLandingPage', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="shorten-form"><input id="destination-url" /></form>
      <p id="form-status"></p>
      <span id="current-year"></span>
    `;
  });

  it('prompts for a URL when the form is empty', () => {
    initializeLandingPage(document);

    document.querySelector<HTMLFormElement>('#shorten-form')?.requestSubmit();

    expect(document.querySelector('#form-status')?.textContent).toBe(
      'Enter a URL when the admin API is available.',
    );
    expect(document.activeElement).toBe(document.querySelector('#destination-url'));
  });

  it('shows the current year and future API status for a URL', () => {
    initializeLandingPage(document);
    const input = document.querySelector<HTMLInputElement>('#destination-url');
    if (!input) throw new Error('Expected destination URL input');
    input.value = 'https://example.com';

    document.querySelector<HTMLFormElement>('#shorten-form')?.requestSubmit();

    expect(document.querySelector('#current-year')?.textContent).toBe(String(new Date().getFullYear()));
    expect(document.querySelector('#form-status')?.textContent).toBe(
      'Link creation will be available with the admin API.',
    );
  });
});
