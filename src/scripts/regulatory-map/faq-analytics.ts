import { trackEvent } from '../../utils/analytics';

document.querySelectorAll('.brutal-faq__item').forEach((item) => {
  item.addEventListener('toggle', () => {
    const details = item as HTMLDetailsElement;
    const question = details.querySelector('.brutal-faq__question')?.textContent?.trim() || '';
    trackEvent({
      event: 'rm_faq_toggle',
      category: 'tool',
      question,
      action: details.open ? 'open' : 'close',
      page: 'regulatory-map',
    });
  });
});
