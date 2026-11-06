/**
 * Copies text; call it straight from the tap handler (PRD R2). Resolves true when it copied.
 *
 * The Clipboard API only exists on https pages. Plain http (testing on the laptop's
 * network address) gets the older way: select the text in a hidden field and copy.
 * That field goes inside an open sheet when there is one, since a modal dialog makes
 * the rest of the page inert and unselectable.
 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (no permission, not a tap): try the older way.
    }
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true; // no keyboard on phones
  field.style.cssText = 'position: fixed; top: 0; left: 0; opacity: 0; font-size: 16px;'; // 16px: no iOS zoom
  (document.querySelector('dialog[open]') ?? document.body).append(field);
  field.select();
  field.setSelectionRange(0, text.length); // iOS ignores select() alone
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}
