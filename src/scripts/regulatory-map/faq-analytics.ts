import { trackEvent } from '../../utils/analytics';

document.querySelectorAll('.brutal-faq__item').forEach((item) => {
  item.addEventListener('toggle', () => {
    const details = item as HTMLDetailsElement;
    // The English question, whatever the page language: the template writes it
    // to `data-analytics-label`, so reports group one question across locales.
    const question =
      details.dataset.analyticsLabel ||
      details.querySelector('.brutal-faq__question')?.textContent?.trim() ||
      '';
    trackEvent({
      event: 'rm_faq_toggle',
      category: 'tool',
      question,
      action: details.open ? 'open' : 'close',
      page: 'regulatory-map',
    });
  });
});
